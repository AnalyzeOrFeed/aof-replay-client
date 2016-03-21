"use strict";

let app           = require("electron").app;
let request       = require("request");
let ipc           = require("electron").ipcMain;
let dialog        = require("electron").dialog;
let BrowserWindow = require("electron").BrowserWindow;
let _             = require("underscore");
let fs            = require("fs");
let winston       = require("winston");

let ddragonBase    = "http://ddragon.leagueoflegends.com/cdn/";
let ddragonVersion = "6.2.1/";
let replay         = null;
let mainWindow     = null;
let settings       = {};
let staticData     = {
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

let Game = require('./modules/game.js');

// Create folder for log files
if (!fs.existsSync(app.getPath("userCache") + "/logs/")){
	fs.mkdirSync(app.getPath("userCache") + "/logs/");
}

// Add loggers
let logFile = app.getPath("userCache") + "/logs/" + (new Date()).getTime() + ".log";
let logger = new winston.Logger({ transports: [] });
logger.add(winston.transports.Console, {
	"level": "debug"
});
logger.add(winston.transports.File, {
	"filename": logFile,
	"level": "debug"
});


// Add global error handlers
process.on("uncaughtException", function (error) {
	logger.error("App Uncaught exception: " + error);
});
process.on("error", function (error) {
	logger.error("App Error: " + error);
});


// Log operating system
logger.info("We are running on " + process.platform);
logger.info("Application data path: " + app.getPath("userCache"));


// Load our modules
let aofParser = require(__dirname + "/modules/aof-parser.js")(logger);
let replayServer = require(__dirname + "/modules/replay-server.js")(logger);
let lolClient = require(__dirname + "/modules/lol-client.js")(logger);
let aofApi = require(__dirname + "/modules/aof-api.js")(logger);


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
	let req = request({ url: "https://api.aof.gg/v2/client/version", json: true }, function(err, response, body) {
		clearTimeout(timeout);

		// Set the new version info if there is one
		if (!err && response && response.statusCode == 200) {
			if (version.currVersion != body.version) {
				version.newVersion = body.version;
				version.msg = body.msg;
			}
		} else {
			logger.warn("Error while retrieving version: " + err + " " + JSON.stringify(response));
		}
		mainWindow.webContents.send("aofUpdate", version);

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
		}

		logger.info("Retrieving static data from server");
		request({ url: "https://api.aof.gg/v2/data/static", json: true, timeout: 10000}, function(err, response, body) {
			if (err || !response || response.statusCode != 200) {
				logger.warn("Error while retrieving static data: " + err + " " + JSON.stringify(response));
				return;
			}
			staticData.regions = body.regions;
			staticData.leagues = body.leagues;
			fs.writeFileSync(app.getPath("userCache") + "/static", JSON.stringify(staticData));

			ddragonVersion = body.newestVersion.riotVersion + "/";

			logger.info("Getting champion info");
			request({ url: ddragonBase + ddragonVersion + "data/en_US/champion.json", json: true, timeout: 10000 }, function(err, response, body) {
				if (!err && response && response.statusCode == 200) {
					staticData.champions = body.data;
				} else {
					logger.warn("Error while retrieving static data: " + err + " " + JSON.stringify(response));
				}
			});

			logger.info("Getting summoner spell info");
			request({ url: ddragonBase + ddragonVersion + "data/en_US/summoner.json", json: true, timeout: 10000 }, function(err, response, body) {
				if (!err && response && response.statusCode == 200) {
					staticData.summonerSpells = body.data;
				} else {
					logger.warn("Error while retrieving static data: " + err + " " + JSON.stringify(response));
				}
			});

			callback();
		});
	});
}


// Extend the metadata of a replay with additional information
function extendReplayMetadata(meta) {
	meta.region = _.find(staticData.regions, function(region) { return region.id == meta.regionId }).shortName;

	for (let i = 0; i < meta.players.length; i++) {
		var p = meta.players[i];

		if (staticData.champions) {
			let champion = _.find(staticData.champions, function(champion) { return champion.key == p.championId });
			p.champion = { name: champion.name, image: champion.image.full };
		}

		if (staticData.leagues) {
			let league = _.find(staticData.leagues, function(league) { return league.id == p.leagueId });
			p.league = { name: league.name, image: league.name.toLowerCase() + ".png" };
		}

		if (staticData.summonerSpells) {
			let d = _.find(staticData.summonerSpells, function(spell) { return spell.key == p.dId });
			p.d = { name: d.name, image: d.image.full };
		}

		if (staticData.summonerSpells) {
			let f = _.find(staticData.summonerSpells, function(spell) { return spell.key == p.fId });
			p.f = { name: f.name, image: f.image.full };
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

				mainWindow.webContents.send("staticData", { version: ddragonVersion });

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
	logger.info("ipc: Select client");

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
	logger.info("ipc: Open replay");

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
	logger.info("ipc: Play replay");
	replayServer.resetReplay();

	mainWindow.minimize();

	lolClient.launch(replayServer.host(), replayServer.port(), replay.region, replay.gameId, replay.key, function(success) {
		mainWindow.restore();

		if (!success) {
			logger.error("Could not start league of legends client.");
			event.sender.send("error", {
				title: "LoL Client error",
				content: 'Could not start the League of Legends client<br />Please send us your current log file by clicking the button below and filling out the form.'
			});
		}
	});
});


ipc.on("sendLogs", function(event, data) {
	logger.info("ipc: Send logs");

	let report = {
		date: new Date(),
		platform: process.platform,
		arch: process.arch,
		aofClient: JSON.parse(fs.readFileSync(__dirname + "/package.json")).version,
		leagueClient: {
			path: lolClient.leaguePath(),
			version: lolClient.version()
		},
		email: data.email,
		comment: data.comment,
		logs: fs.readFileSync(logFile, 'utf8')
	};

	request({
		url: "https://api.aof.gg/v2/client/reports",
		method: "POST",
		json: true,
		headers: {
			"content-type": "application/json"
		},
		body: report
	}, function(err, httpResponse, body){
		if (httpResponse.statusCode != 200) {
			logger.error("Sending report failed.", {err: err, httpResponse: httpResponse.statusCode, body: body});
			event.sender.send("error", {
				title: "Error sending report",
				content: "Could not send error report.<br>Please report your issue to support@aof.gg and provide the following file: " + logFile });
		}
	});
});

let recordingGame = false; // used for testing

let leagueRunning = false;
let checkForLeague = function() {
	if (!recordingGame) {
		var exec = require('child_process').exec;
		exec('tasklist', function (err, stdout, stderr) {
			let splits = stdout.split("\n");
			let proc = _.find(splits, function (proc) {
				return proc.indexOf("League of Legends") === 0 && proc.indexOf("Console") > 0;
			});

			if (proc && !leagueRunning) {
				aofApi.checkMe(function (game) {
					if (game) {
						logger.info("We're ingame!");
						updateGame(game);
					} else {
						logger.info("False alarm");
					}
				});
			}

			leagueRunning = proc ? true : false;
			mainWindow.webContents.send("gameSwitch", leagueRunning);
		});
		exec('ps -ax | grep -i "LoL/RADS/solutions"', function (err, stdout, stderr) {
			let splits = stdout.split("\n");

			let proc = _.find(splits, function (proc) {
				return proc.indexOf("deploy/bin/LolClient") >= 0;
			});

			if (proc && !leagueRunning) {
				logger.info('Running');
				aofApi.checkMe(function (game) {
					if (game) {
						logger.info("We're ingame!");
						recordingGame = true;
						let myGame = new Game(game.regionId, game.gameId);
						myGame.downloadReplay((err, data) => {
							// Should be called when the game is finished and aof file created.
						});

						// updateGame(game);
					} else {
						logger.info("False alarm");
					}
				});
			}

			leagueRunning = proc ? true : false;
			mainWindow.webContents.send("gameSwitch", leagueRunning);
		});
	}
};

// Setup windows
app.on("ready", function() {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 600,
		toolbar: false,
		"auto-hide-menu-bar": true
	});

	// Open the DevTools.
	//mainWindow.openDevTools();

	// Load the index.html of the app.
	mainWindow.loadURL("file://" + __dirname + "/index.html");

	// When window is closed
	mainWindow.on("closed", function() {
		mainWindow = null;
	});

	setInterval(checkForLeague, 1000);
});

let updateGame = function(game) {
	let regionId = game.regionId;
	let gameId = game.gameId;
	game.state = 1;
	game.region.url = "http://spectator.euw1.lol.riotgames.com/";
	game.region.spec = "EUW1";
	game.metaErrors = 0;

	let retry = function(time) {
		// Check what to do next
		if (game.metaErrors > 10) {
			logger.warn("Canceled game %s", game.key);
		} else {
			// Wait for timeout for next check
			setTimeout(function() {
				updateGame(game);
			}, time);
		}
	};

	if (game.state == 1) {
		let url = encodeURI(game.region.url + "observer-mode/rest/consumer/getGameMetaData/" + game.region.spec + "/" + game.id + "/0/token");
		request.get(url, options, function(err, response, metaData) {
			if (err || response.statusCode != 200) {
				logger.warn("GameMetaData error: %s, %s for %s", err, response ? response.statusCode : null, game.key);
				game.metaErrors++;
				retry(10000);
			} else if (metaData.startGameChunkId > 0) {
				game.endStartupChunkId = metaData.endStartupChunkId;
				game.startGameChunkId = metaData.startGameChunkId;
				game.isFeatured = metaData.featuredGame;
				game.mmr = metaData.interestScore;

				game.state = 2;

				retry(0);
			} else {
				logger.log("debug", "Game %s hasn't started yet", game.key);
				retry(30000);
			}
		});
	} else if (game.state == 2) {
		let url = encodeURI(game.region.url + "observer-mode/rest/consumer/getLastChunkInfo/" + game.region.spec + "/" + game.id + "/0/token");
		request.get(url, options, function(err, response, chunkInfo) {
			if (err || response.statusCode != 200) {
				logger.warn("LastChunkInfo error: %s, %s for %s", err, response ? response.statusCode : null, game.key);
				game.metaErrors++;
				retry(10000);
				return;
			}

			game.oldKeyframeId = game.newestKeyframeId;
			game.oldChunkId = game.newestChunkId;

			game.newestKeyframeId = Math.max(game.newestKeyframeId, chunkInfo.keyFrameId);
			game.newestChunkId = Math.max(game.newestChunkId, chunkInfo.chunkId);
			game.isDone = game.newestChunkId != 0 && game.newestChunkId == chunkInfo.endGameChunkId;

			// Download new keyframes and chunks
			for (let i = game.oldKeyframeId + 1; i <= game.newestKeyframeId; i++) {
				game.running++;
				downloadObject(game, 1, i, 0);
			}
			for (let i = game.oldChunkId + 1; i <= game.newestChunkId; i++) {
				game.running++;
				downloadObject(game, 0, i, 0);
			}

			if (!game.isDone) {
				retry(chunkInfo.nextAvailableChunk + 1000);
				return;
			}

			// Check for active downloads
			if (game.running > 0 && game.isWaiting < 10) {
				logger.info("Game %s has %s downloads running", game.key, game.running);

				game.isWaiting++;
				retry(10000);
				return;
			} else if (game.isWaiting >= 10) {
				logger.warn("Game %s continues after waiting 10 times", game.key);
			}

			// Get meta data for endgame stats
			let url = encodeURI(game.region.url + "observer-mode/rest/consumer/getGameMetaData/" + game.region.spec + "/" + game.id + "/0/token");
			request.get(url, options, function(err, response, metaData) {
				if (err || response.statusCode != 200) {
					logger.warn("GameMetaData error: %s, %s for %s", err, response ? response.statusCode : null, game.key);
					game.metaErrors++;
					retry(10000);
				} else {
					if (metaData.gameEnded) {
						logger.info("Game %s is done", game.key);

						game.state = 3;

						uploadGame(game);
					} else {
						logger.warn("Last available chunk but game %s isn't done", game.key);
						retry(10000);
					}
				}
			});
		});
	} else if (game.state == 3) {
		logger.warn("Game %s is alredy done, trying to (re)upload", game.key);
		uploadGame(game);
	} else {
		logger.warn("Game %s is already done and uploaded, skipping", game.key);
		finishGame(game);
	}
};