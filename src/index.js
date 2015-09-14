"use strict";

let app = require("app");
let request = require("request");
let ipc = require("ipc");
let dialog = require("dialog");
let BrowserWindow = require("browser-window");
let _  = require("underscore");
let fs = require("fs");

let aofParser = require(__dirname + "/modules/aof-parser.js");
let replayServer = require(__dirname + "/modules/replay-server.js");
let lolClient = require(__dirname + "/modules/lol-client.js");

let replay = null;
let mainWindow = null;
let staticData = {
	checked: false,
	extended: false,
	regions: [
		{"Id":5,"Name":"Brazil","ShortName":"BR"},
		{"Id":2,"Name":"Europe Nordic & East","ShortName":"EUNE"},
		{"Id":1,"Name":"Europe West","ShortName":"EUW"},
		{"Id":6,"Name":"Korea","ShortName":"KR"},
		{"Id":4,"Name":"Latin America North","ShortName":"LAN"},
		{"Id":8,"Name":"Latin America South","ShortName":"LAS"},
		{"Id":3,"Name":"North America","ShortName":"NA"},
		{"Id":7,"Name":"Oceania","ShortName":"OCE"},
		{"Id":11,"Name":"Public Beta Environment","ShortName":"PBE"},
		{"Id":9,"Name":"Russia","ShortName":"RU"},
		{"Id":10,"Name":"Turkey","ShortName":"TR"}
	]
};

// Log operating system
console.log("We are running on " + process.platform);

// Quit when all windows are closed.
app.on("window-all-closed", function() {
	if (process.platform != "darwin") {
		app.quit();
	}
});

// Get static data from api
fs.readFile(app.getPath("userCache") + "/.static", function(err, data) {
	if (!err) {
		console.log("Reading static data from local cache");
		staticData = JSON.parse(data);
		staticData.extended = true;
	}
	
	console.log("Retrieving static data from server");
	request({ url: "http://api.aof.gg/static", json: true }, function(err, response, body) {
		if (!err && response && response.statusCode == 200 && !body.err && body.data) {
			staticData = body.data;
			staticData.extended = true;
			fs.writeFileSync(app.getPath("userCache") + "/.static", JSON.stringify(staticData));
		} else {
			console.log("Error while retrieving static data: " + err + " " + JSON.stringify(response));
		}
		
		staticData.checked = true;
		if (mainWindow)
			mainWindow.webContents.send("staticData", true);
	});
});

// Check for updates
console.log("Checking for updates");
let version = { currVersion: JSON.parse(fs.readFileSync(__dirname + "/package.json")).version, newVersion: null, msg: null };
request({ url: "http://api.aof.gg/version", json: true }, function(err, response, body) {
	if (!err && response && response.statusCode == 200) {
		if (version.currVersion != body.version) {
			version.newVersion = body.version;
			version.msg = body.msg;	
		}
		if (mainWindow)
			mainWindow.webContents.send("update", version);
	} else {
		console.log("Error while retrieving version: " + err + " " + JSON.stringify(response));
	}
});

// Start our replay server
replayServer.startServer();

// Try and find the league client
lolClient.find();

let extendReplayMetadata = function(meta) {
	meta.region = _.find(staticData.regions, function(region) { return region.Id == meta.regionId }).ShortName;
	
	if (staticData.extended) {
		for (let i = 0; i < meta.players.length; i++) {
			var p = meta.players[i];
			
			let champion = _.find(staticData.champions, function(champion) { return champion.Id == p.championId });
			p.champion = { name: champion.Name, image: champion.Image };
			
			let league = _.find(staticData.leagues, function(league) { return league.Id == p.leagueId });
			p.league = { name: league.Name, image: league.Image };
			
			let d = _.find(staticData.summonerSpells, function(spell) { return spell.Id == p.dId });
			p.d = { name: d.Name, image: d.Image };
			
			let f = _.find(staticData.summonerSpells, function(spell) { return spell.Id == p.fId });
			p.f = { name: f.Name, image: f.Image };
		}
	}
	return meta;
};

// Listen for renderer messages
ipc.on("ready", function(event, args) {
	if (staticData.checked)
		event.sender.send("staticData", true);
	if (version)
		event.sender.send("update", version);
	event.sender.send("clientInfo", { found: lolClient.isFound(), version: lolClient.version() });
});
ipc.on("selectClient", function(event, args) {
	var files = dialog.showOpenDialog({
		filters: [{ name: 'League of Legends Client', extensions: ['app', 'exe'] }],
		properties: [ "openFile" ]
	});
	
	if (files && files.length == 1) {
		lolClient.extractPath(files[0]);
		event.sender.send("clientInfo", { found: lolClient.isFound(), version: lolClient.version() });
	}
});
ipc.on("openReplay", function(event, args) {
	let files = dialog.showOpenDialog({
		filters: [{ name: 'Replay File', extensions: ['aof'] }],
		properties: [ "openFile" ]
	});
	
	if (files && files.length == 1) {
		aofParser.parse(files[0], function(err, replayMetadata, replayData) {
			if (err) {
				console.log(err);
			} else {
				replay = extendReplayMetadata(replayMetadata);
				event.sender.send("parsedReplayFile", replay);
				replayServer.loadReplay(replay, replayData);
			}
		});
	}
});
ipc.on("play", function(event, args) {
	replayServer.resetReplay();
	
	let run = lolClient.launch(replayServer.host(), replayServer.port(), staticData.regions[replay.regionId].ShortName, replay.gameId, replay.key, function() {
		mainWindow.restore();
	});
	
	if (run) {
		mainWindow.minimize();
	} else {
		console.log("Could not run league client");
	}
});

// Setup windows
app.on("ready", function() {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		toolbar: false,
		"auto-hide-menu-bar": true
	});
	
	// Open the DevTools.
	// mainWindow.openDevTools();
	
	// Load the index.html of the app.
	mainWindow.loadUrl("file://" + __dirname + "/index.html");
	
	// When window is closed
	mainWindow.on("closed", function() {
		mainWindow = null;
	});
});
