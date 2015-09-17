"use strict";

let app = require("app");
let request = require("request");
let ipc = require("ipc");
let dialog = require("dialog");
let BrowserWindow = require("browser-window");
let _  = require("underscore");
let fs = require("fs");
let winston = require("winston");

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


// Create folder for log files
fs.mkdirSync(app.getPath("userCache") + "/logs/");


// Add loggers
let logFile = app.getPath("userCache") + "/logs/" + (new Date()).getTime() + ".log";
let logger = new winston.Logger({ transports: [] });
logger.add(winston.transports.Console, {
	"level": "info"
});
logger.add(winston.transports.File, {
	"filename": logFile,
	"level": "debug"
});


// Add global error handlers
process.on("uncaughtException", function (error) {
	logger.error("App Uncaught exception: " + error);
}
process.on("error", function (error) {
	logger.error("App Error: " + error);
}


// Log operating system
logger.info("We are running on " + process.platform);
logger.info("Application data path: " + app.getPath("userCache"));


// Load our modules
let aofParser = require(__dirname + "/modules/aof-parser.js")(logger);
let replayServer = require(__dirname + "/modules/replay-server.js")(logger);
let lolClient = require(__dirname + "/modules/lol-client.js")(logger);


// Quit when all windows are closed.
app.on("window-all-closed", function() {
	if (process.platform != "darwin") {
		app.quit();
	}
});


// User settings
function loadUserSettings(callback) {
	logger.info("Loading user settings");
	fs.readFile(app.getPath("userCache") + "/settings", function(err, data) {
		if (!err) {
			settings = JSON.parse(data);
		}
		
		callback();
	});
}
function saveUserSettings() {
	logger.info("Saving user settings");
	settings.lolClientPath = lolClient.leaguePath();
	fs.writeFileSync(app.getPath("userCache") + "/settings", JSON.stringify(settings, null, 2));
}


// Check for updates
function checkForUpdates(callback) {
	logger.info("Checking for application updates");
	let version = { currVersion: JSON.parse(fs.readFileSync(__dirname + "/package.json")).version, newVersion: null, msg: null };
	let timeout = setTimeout(function() {
		req.abort();
		logger.warn("Could not check for updates, request timed out");
		callback();
	}, 5000);
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
			logger.warn("Error while retrieving version: " + err + " " + JSON.stringify(response));
		}
		
		callback();
	});	
}


// Get static data from api
function getStaticData(callback) {
	logger.info("Loading static data");
	fs.readFile(app.getPath("userCache") + "/static", function(err, data) {
		if (!err) {
			logger.info("Reading static data from local cache");
			staticData = JSON.parse(data);
			staticData.extended = true;
		}
		
		logger.info("Retrieving static data from server");
		request({ url: "http://api.aof.gg/static", json: true ,timeout: 10000}, function(err, response, body) {
			if (!err && response && response.statusCode == 200 && !body.err && body.data) {
				staticData = body.data;
				staticData.extended = true;
				fs.writeFileSync(app.getPath("userCache") + "/static", JSON.stringify(staticData));
			} else {
				logger.warn("Error while retrieving static data: " + err + " " + JSON.stringify(response));
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
				logger.warn("Could not parse replay file " + files[0] + ": " + err);
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
	
	mainWindow.minimize();
	
	lolClient.launch(replayServer.host(), replayServer.port(), staticData.regions[replay.regionId].ShortName, 
			replay.gameId, replay.key, function(success) {
		mainWindow.restore();
		
		if (!success)
			event.sender.send("error", { 
				title: "LoL Client error",
				content: "Could not start the League of Legends client<br>Please send us your current log file so we can reproduce what happened. (You can send the report in the top right)."});
	});
});


ipc.on("sendLogs", function(event, args) {
	console.log("sending report");
	let report = {
		date: new Date(),
		platform: process.platform,
		arch: process.arch,
		aofClient: JSON.parse(fs.readFileSync(__dirname + "/package.json")).version,
		leagueClient: {
			path: lolClient.leaguePath(),
			version: lolClient.version()
		},
		logs: fs.readFileSync(logFile, 'utf8')
	};

	console.log(JSON.stringify(report));

	request({
		url: "http://api.aof.gg/client/reports",
		method: "POST",
		json: true,
		headers: {
			"content-type": "application/json"
		},
		body: report
	}, function(err,httpResponse,body){
		if (httpResponse.statusCode != 200) {
			event.sender.send("error", {
				title: "Error sending report",
				content: "Could not send error report.<br>Please report your issue to support@aof.gg and provide the following file: " + logFile });
		} else {

		}

	});
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
