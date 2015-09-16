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
let settings = {};
let staticData = {
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

// User settings
function loadUserSettings(callback) {
	console.log("Loading user settings");
	fs.readFile(app.getPath("userCache") + "/settings", function(err, data) {
		if (!err) {
			settings = JSON.parse(data);
		}
		
		callback();
	});
}
function saveUserSettings() {
	console.log("Saving user settings");
	settings.lolClientPath = lolClient.leaguePath();
	fs.writeFileSync(app.getPath("userCache") + "/settings", JSON.stringify(settings, null, 2));
}


// Check for updates
function checkForUpdates(callback) {
	console.log("Checking for application updates");
	let version = { currVersion: JSON.parse(fs.readFileSync(__dirname + "/package.json")).version, newVersion: null, msg: null };
	let timeout = setTimeout(function() {
		req.abort();
		console.log("Could not check for updates, request timed out");
		callback();
	}, 10000);
	let req = request({ url: "http://api.aof.gg/version", json: true }, function(err, response, body) {
		clearTimeout(timeout);
		if (!err && response && response.statusCode == 200) {
			// Set the new version info if there is one
			if (version.currVersion != body.version) {
				version.newVersion = body.version;
				version.msg = body.msg;
			}
			mainWindow.webContents.send("aofUpdate", version);
		} else {
			console.log("Error while retrieving version: " + err + " " + JSON.stringify(response));
		}
		
		callback();
	});	
}


// Get static data from api
function getStaticData(callback) {
	console.log("Loading static data");
	fs.readFile(app.getPath("userCache") + "/static", function(err, data) {
		if (!err) {
			console.log("Reading static data from local cache");
			staticData = JSON.parse(data);
			staticData.extended = true;
		}
		
		console.log("Retrieving static data from server");
		let timeout = setTimeout(function() {
			req.abort();
			console.log("Could not retreive static data, request timed out");
			callback();
		}, 10000)
		let req = request({ url: "http://api.aof.gg/static", json: true }, function(err, response, body) {
			if (!err && response && response.statusCode == 200 && !body.err && body.data) {
				staticData = body.data;
				staticData.extended = true;
				fs.writeFileSync(app.getPath("userCache") + "/static", JSON.stringify(staticData));
			} else {
				console.log("Error while retrieving static data: " + err + " " + JSON.stringify(response));
			}
			
			callback();
		});
	});	
}


// Extend the metadata of a replay with additional information
function extendReplayMetadata(meta) {
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
}


// Called when the renderer is ready to display things
ipc.on("ready", function(event, args) {
	
	mainWindow.webContents.send("loading", { loading: true, msg: "Loading user settings..." });
	loadUserSettings(function() {
		
		mainWindow.webContents.send("loading", { loading: true, msg: "Checking for updates..." });
		checkForUpdates(function() {
			
			mainWindow.webContents.send("loading", { loading: true, msg: "Retreiving static data..." });
			getStaticData(function() {
				
				mainWindow.webContents.send("loading", { loading: true, msg: "Searching for league client..." });
				lolClient.find(settings.lolClientPath, function(found) {
					
					mainWindow.webContents.send("loading", { loading: true, msg: "Starting local replay server..." });
					replayServer.startServer();
					
					mainWindow.webContents.send("clientInfo", { found: lolClient.isFound(), version: lolClient.version() });
					mainWindow.webContents.send("loading", { loading: false, msg: "" });
					
					saveUserSettings();
				});
			});
		});
	});
});


// Called when the user wants to select the league client manually
ipc.on("selectClient", function(event, args) {
	var files = dialog.showOpenDialog({
		filters: [{ name: 'League of Legends Client', extensions: ['app', 'exe'] }],
		properties: [ "openFile" ]
	});
	
	if (files && files.length == 1) {
		lolClient.extractPath(files[0], function() {
			event.sender.send("clientInfo", { found: lolClient.isFound(), version: lolClient.version() });
			saveUserSettings();
		});
	}
});


// Called when the user wants to open a replay
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


// Called when the user wants to play a replay
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
