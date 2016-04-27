"use strict";

let app           = require("electron").app;
let request       = require("request");
let ipc           = require("electron").ipcMain;
let dialog        = require("electron").dialog;
let BrowserWindow = require("electron").BrowserWindow;
let _             = require("lodash");
let mkdirp        = require("mkdirp");
let fs            = require("fs");
let winston       = require("winston");

let ddragonBase    = "http://ddragon.leagueoflegends.com/cdn/";
let ddragonVersion = "6.2.1/";
let constUrl       = "observer-mode/rest/consumer/";
let replay         = null;
let mainWindow     = null;
let settings       = {};
let staticData     = {
	"extended": false,
	"regions": [{
		"id": 1,
		"name": "Europe West",
		"shortName": "EUW",
		"spectatorUrl": "http://spectator.euw1.lol.riotgames.com/",
		"spectatorRegion": "EUW1"
	}, {
		"id": 2,
		"name": "Europe Nordic & East",
		"shortName": "EUNE",
		"spectatorUrl": "http://spectator.eu.lol.riotgames.com:8088/",
		"spectatorRegion": "EUN1"
	}, {
		"id": 3,
		"name": "North America",
		"shortName": "NA",
		"spectatorUrl": "http://spectator.na.lol.riotgames.com/",
		"spectatorRegion": "NA1"
	}, {
		"id": 4,
		"name": "Latin America North",
		"shortName": "LAN",
		"spectatorUrl": "http://spectator.la1.lol.riotgames.com/",
		"spectatorRegion": "LA1"
	}, {
		"id": 5,
		"name": "Brazil",
		"shortName": "BR",
		"spectatorUrl": "http://spectator.br.lol.riotgames.com/",
		"spectatorRegion": "BR1"
	}, {
		"id": 6,
		"name": "Korea",
		"shortName": "KR",
		"spectatorUrl": "http://spectator.kr.lol.riotgames.com/",
		"spectatorRegion": "KR"
	}, {
		"id": 7,
		"name": "Oceania",
		"shortName": "OCE",
		"spectatorUrl": "http://spectator.oc1.lol.riotgames.com/",
		"spectatorRegion": "OC1"
	}, {
		"id": 8,
		"name": "Latin America South",
		"shortName": "LAS",
		"spectatorUrl": "http://spectator.la2.lol.riotgames.com/",
		"spectatorRegion": "LA2"
	}, {
		"id": 9,
		"name": "Russia",
		"shortName": "RU",
		"spectatorUrl": "http://spectator.ru.lol.riotgames.com/",
		"spectatorRegion": "RU"
	}, {
		"id": 10,
		"name": "Turkey",
		"shortName": "TR",
		"spectatorUrl": "http://spectator.tr.lol.riotgames.com/",
		"spectatorRegion": "TR1"
	}, {
		"id": 11,
		"name": "Public Beta Environment",
		"shortName": "PBE",
		"spectatorUrl": "http://spectator.pbe1.lol.riotgames.com:8080/",
		"spectatorRegion": "PBE1"
	}, {
		"id": 12,
		"name": "Japan",
		"shortName": "JP",
		"spectatorUrl": "http://spectator.jp1.lol.riotgames.com/",
		"spectatorRegion": "JP1"
	}]
};
let appDataPath = app.getPath("userData") + "/";
let replayPath = app.getPath("documents") + "/Analyze or Feed/Replays/";

// Create folder for log files
mkdirp.sync(appDataPath + "logs/");
mkdirp.sync(appDataPath + "cache/");
mkdirp.sync(replayPath);

// Add loggers
let logFile = appDataPath + "logs/" + (new Date()).getTime() + ".log";
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
logger.info("Application data path: " + appDataPath);

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
	fs.readFile(appDataPath + "settings", function(err, data) {
		if (!err) {
			settings = JSON.parse(data);
		}
		
		callback();
	});
}
function saveUserSettings() {
	logger.info("Saving user settings");
	settings.lolClientPath = lolClient.leaguePath();
	fs.writeFileSync(appDataPath + "settings", JSON.stringify(settings, null, 2));
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
	fs.readFile(appDataPath + "static", function(err, data) {
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
			fs.writeFileSync(appDataPath + "static", JSON.stringify(staticData));
			
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
	meta.region = _.find(staticData.regions, { "id": meta.regionId }).shortName;
	
	for (let i = 0; i < meta.players.length; i++) {
		var p = meta.players[i];
		
		if (staticData.champions) {
			let champion = _.find(staticData.champions, { "key": p.championId.toString() });
			p.champion = { name: champion.name, image: champion.image.full };
		}
		
		if (staticData.leagues) {
			let league = _.find(staticData.leagues, { "id": p.leagueId });
			p.league = { name: league.name, image: league.name.toLowerCase() + ".png" };
		}
		
		if (staticData.summonerSpells) {
			let d = _.find(staticData.summonerSpells, { "key": p.dId.toString() });
			p.d = { name: d.name, image: d.image.full };
		}
		
		if (staticData.summonerSpells) {
			let f = _.find(staticData.summonerSpells, { "key": p.fId.toString() });
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
	
	var files = dialog.showOpenDialog(mainWindow, {
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
	
	let files = [];
	if (!args) {
		files = dialog.showOpenDialog(mainWindow, {
			filters: [{ name: 'AoF Replay File', extensions: ['aof'] }],
			properties: [ "openFile" ],
			defaultPath: replayPath
		});
	} else {
		files.push(args);
	}
	
	if (files && files.length == 1) {
		aofParser.parse(files[0], function(err, replayMetadata, replayData) {
			if (err) {
				logger.warn("Could not parse replay file " + files[0] + ": " + err);
				event.sender.send("parsedReplayFile", { err: err.toString() });
			} else {
				replay = extendReplayMetadata(replayMetadata);
				event.sender.send("parsedReplayFile", { replay: replay });
				replayServer.loadReplay(replay, replayData);
			}
		});
	}
});

ipc.on("login", function(event, args) {
	aofApi.login(args.email, args.password, function(success) {
		if (success) event.sender.send("login");
		else event.sender.send("recordingStatus", "Invalid email and/or password. Visit aof.gg to create an account.");
	});
});

// Called when the user wants to play a replay
let playingReplay = false;
ipc.on("play", function(event, args) {
	logger.info("ipc: Play replay");
	replayServer.resetReplay();
	
	playingReplay = true;
	mainWindow.minimize();
	
	lolClient.launch(replayServer.host(), replayServer.port(), replay.region, replay.gameId, replay.key, function(success) {
		playingReplay = false;
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

// Called when the user wants to send the log files to the aof server
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

// Checks to see if the LoL client is running
var leagueChecking = false;
var leagueRecording = false;
let checkForLeague = function() {
	if (leagueChecking) return;
	leagueChecking = true;

	if (leagueRecording) {
		leagueChecking = false
		return;
	}

	if (!aofApi.loggedIn()) {
		leagueChecking = false;
		return;
	}

	if (playingReplay) {
		mainWindow.webContents.send("recordingStatus", "Watching a replay...");
		leagueChecking = false;
		return;
	}

	var cb = function(proc) {
		if (!proc) {
			mainWindow.webContents.send("recordingStatus", "Waiting for a match...");
			leagueChecking = false;
			return;
		}

		aofApi.checkMe(function(game) {
			if (!game) {
				mainWindow.webContents.send("recordingStatus", "Match started, waiting for info...");
				leagueChecking = false;
				return;
			}

			game.state = 1;
			game.region = _.find(staticData.regions, { "id": game.regionId });
			game.metaErrors = 0;
			game.key = game.regionId + "-" + game.gameId;
			game.oldKeyframeId = game.newestKeyframeId = 0;
			game.oldChunkId = game.newestChunkId = 0;
			game.chunks = [ null ];
			game.keyframes = [ null ];
			game.running = 0;
			game.isWaiting = 0;

			leagueRecording = true;
			updateGame(game);

			mainWindow.webContents.send("recordingStatus", "Recording...");
			leagueChecking = false;
		});
	};

	var exec = require('child_process').exec;
	
	if (process.platform == "win32") {
		exec('tasklist', function(err, stdout, stderr) {
			let splits = stdout.split("\n");
			let proc = _.find(splits, function(proc) {
				return proc.indexOf("League of Legends") === 0 && proc.indexOf("Console") > 0;
			});

			cb(proc);
		});
	} else {
		exec('ps -ax | grep -i "LoL/RADS/solutions"', function (err, stdout, stderr) {
			let splits = stdout.split("\n");
			let proc = _.find(splits, function (proc) {
				return proc.indexOf("deploy/bin/LolClient") >= 0;
			});

			cb(proc);
		});
	}
};

// Setup windows
app.on("ready", function() {
	mainWindow = new BrowserWindow({
		width: 800,
		height: 630,
		toolbar: false,
		autoHideMenuBar: true,
		resizable: false
	});
	
	// Open the DevTools.
	//mainWindow.openDevTools();
	
	// Load the index.html of the app.
	mainWindow.loadURL("file://" + __dirname + "/index.html");

	// Before closing
	mainWindow.on("close", function(e) {
		if (leagueRecording) {
			let res = dialog.showMessageBox(mainWindow, {
				type: "error",
				title: "Recording in progress",
				message: "The AoF Client is currently recording a game, if you quit now the replay of that game might be incomplete. " + 
					"Do you really want to exit?",
				buttons: [ "Keep recording", "Close anyways" ],
				noLink: true
			});
			if (res === 0) e.preventDefault();
		}
	});

	// When window is closed
	mainWindow.on("closed", function() {
		mainWindow = null;
	});

	setInterval(checkForLeague, 2000);
});

// Updates the status of a game that is being recorded
let updateGame = function(game) {
	let retry = function(time) {
		// Check what to do next
		if (game.metaErrors > 10) {
			logger.warn("Canceled game %s", game.key);

			leagueRecording = false;
			mainWindow.webContents.send("recordingStatus", "Recording canceled!");
		} else {
			// Wait for timeout until next check
			setTimeout(function() {
				updateGame(game);
			}, time);
		}
	};

	if (game.state == 1) {
		let url = encodeURI(game.region.spectatorUrl + constUrl + "getGameMetaData/" + game.region.spectatorRegion + "/" + game.gameId + "/0/token");
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
				logger.log("info", "Game %s hasn't started yet", game.key);
				retry(30000);
			}
		});
	} else if (game.state == 2) {
		let url = encodeURI(game.region.spectatorUrl + constUrl + "getLastChunkInfo/" + game.region.spectatorRegion + "/" + game.gameId + "/0/token");
		request.get(url, options, function(err, response, chunkInfo) {
			if (err || !response || response.statusCode != 200) {
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
			
			// Get meta data
			let url = encodeURI(game.region.spectatorUrl + constUrl + "getGameMetaData/" + game.region.spectatorRegion + "/" + game.gameId + "/0/token");
			request.get(url, options, function(err, response, metaData) {
				if (err || response.statusCode != 200) {
					logger.warn("GameMetaData error: %s, %s for %s", err, response ? response.statusCode : null, game.key);
					game.metaErrors++;
					retry(10000);
					return;
				}

				if (metaData.gameEnded) {
					logger.info("Game %s is done", game.key);
					
					game.state = 3;
					
					finishGame(game);
				} else {
					logger.warn("Last available chunk but game %s isn't done", game.key);
					retry(10000);
				}
			});
		});
	}
};

// Downloads a keyframe/chunk for a recording game
let dir = appDataPath + "cache/";
let options = { timeout: 10000, json: true };
let downloadObject = function(game, typeId, objectId, tries) {
	let start = process.hrtime();
	let key = game.region.id + "-" + game.gameId + "-" + (typeId === 1 ? "K" : "C") + "-" + objectId;
	let url = game.region.spectatorUrl + constUrl + (typeId === 1 ? "getKeyFrame" : "getGameDataChunk") + "/" + 
		game.region.spectatorRegion + "/" + game.gameId + "/" + objectId + "/token?rito=" + (new Date()).getTime();
	
	tries++;
	logger.log("info", "Downloading %s try #%s", key, tries);

	// Download game object from spectator endpoint
	request(url, { encoding: null, timeout: 10000 }, function(err, response, data) {
		if (err || response.statusCode != 200) {
			logger.warn("Could not download %s: Error: %s, Response %s", key, err, response.statusCode);
			if (tries < 10) {
				let time =  tries * 2000;
				logger.log("info", "Retrying download %s in %s", key, time);
				setTimeout(function() { downloadObject(game, typeId, objectId, tries); }, time);
			} else {
				logger.warn("Stopped download %s: Too many retries", key);
				
				// Save missing keyframe in game & record stats
				if (typeId == 1) {
					game.keyframes[objectId] = false;
				} else {
					game.chunks[objectId] = false;
				}

				game.running--;
				if (game.running < 0) {
					logger.error("Game %s has negative downloads running", game.key);
					game.running = 0;
				}
			}
			return;
		}

		// Save to file
		fs.writeFile(dir + key, data, function(err) {
			if (err) {
				logger.error(err);

				if (typeId == 1) {
					game.keyframes[objectId] = false;
				} else {
					game.chunks[objectId] = false;
				}
			} else {
				if (typeId == 1) {
					game.keyframes[objectId] = data.length;
				} else {
					game.chunks[objectId] = data.length;
				}
			}

			game.running--;
			if (game.running < 0) {
				logger.error("Game %s has negative downloads running", game.key);
				game.running = 0;
			}
		});
	});
};

// Completes the recording process of a game
let finishGame = function(game) {
	logger.log("debug", "Creating replay file for %s", game.key);

	// Count total keyframes and chunks
	let dataLength = 0;
	let totalKeyframes = 0;
	for (let i = 1; i <= game.newestKeyframeId; i++) {
		if (game.keyframes[i]) {
			dataLength += game.keyframes[i];
			totalKeyframes++;
		}
	}
	let totalChunks = 0;
	for (let i = 1; i <= game.newestChunkId; i++) {
		if (game.chunks[i]) {
			dataLength += game.chunks[i];
			totalChunks++;
		}
	}
	let complete = totalKeyframes == game.newestKeyframeId && totalChunks == game.newestChunkId ? 1 : 0;
	
	// Create a replay file	
	let c = 0;
	let keyLen = Buffer.byteLength(game.enc, "base64");
	let buff = new Buffer(18 + keyLen);
	
	// Splits gameId into low and high 32bit numbers
	let high = Math.floor(game.gameId / 4294967296);             // right shift by 32 bits (js doesn't support ">> 32")
	let low = game.gameId - high * 4294967296;                   // extract lower 32 bits
	
	// File version
	buff.writeUInt8(12, c);                                 c += 1;
	
	// Extract bytes for riot version
	let splits = game.version.split(".");
	
	logger.log("debug", "Writing basic game info for %s", game.key);
	
	// Basic game info
	buff.writeUInt8(game.region.id, c);                     c += 1;
	buff.writeUInt32BE(high, c);                            c += 4;
	buff.writeUInt32BE(low, c);                             c += 4;
	buff.writeUInt8(splits[0], c);                          c += 1;
	buff.writeUInt8(splits[1], c);                          c += 1;
	buff.writeUInt8(splits[2], c);                          c += 1;
	buff.writeUInt8(keyLen, c);                             c += 1;
	buff.write(game.enc, c, keyLen, "base64");              c += keyLen;
	buff.writeUInt8(complete ? 1 : 0, c);                   c += 1;
	buff.writeUInt8(game.endStartupChunkId, c);             c += 1;
	buff.writeUInt8(game.startGameChunkId, c);              c += 1;
	
	logger.log("debug", "Writing player info for %s", game.key);
	
	// Players
	buff.writeUInt8(game.players.length, c);                c += 1;
	for (let i = 0; i < game.players.length; i++) {
		let p = game.players[i];
		let len = Buffer.byteLength(p.name, "utf8");
		let tempBuff = new Buffer(20 + len);
		let d = 0;
		
		tempBuff.writeInt32BE(p.id, d);            d += 4;
		tempBuff.writeUInt8(len, d);               d += 1;
		tempBuff.write(p.name, d, len, "utf8");    d += len;
		tempBuff.writeUInt8(p.teamNr, d);          d += 1;
		tempBuff.writeUInt8(p.lId, d);	           d += 1;
		tempBuff.writeUInt8(p.lRank, d);           d += 1;
		tempBuff.writeInt32BE(p.cId, d);           d += 4;
		tempBuff.writeInt32BE(p.s1Id, d);          d += 4;
		tempBuff.writeInt32BE(p.s2Id, d);          d += 4;
		
		buff = Buffer.concat([ buff, tempBuff ]);           c += tempBuff.length;
	}
	
	// Extend buffer
	buff = Buffer.concat([ buff, new Buffer(4 + dataLength + (totalKeyframes + totalChunks) * 6) ]);

	logger.log("debug", "Writing keyframes for %s", game.key);
	
	// Keyframes
	buff.writeUInt16BE(totalKeyframes, c);                  c += 2;
	_.each(game.keyframes, function(keyframe, index) {
		if (!keyframe)
			return;

		buff.writeUInt16BE(index, c);                       c += 2;
		buff.writeInt32BE(keyframe, c);                     c += 4;

		fs.readFileSync(dir + game.region.id + "-" + game.gameId + "-K-" + index).copy(buff, c);

		c += keyframe;
	});
	
	logger.log("debug", "Writing chunks for %s", game.key);
	
	// Chunks
	buff.writeUInt16BE(totalChunks, c);                     c += 2;
	_.each(game.chunks, function(chunk, index) {
		if (!chunk)
			return;

		buff.writeUInt16BE(index, c);                       c += 2;
		buff.writeInt32BE(chunk, c);                        c += 4;

		fs.readFileSync(dir + game.region.id + "-" + game.gameId + "-C-" + index).copy(buff, c);

		c += chunk;
	});

	fs.writeFileSync(replayPath + game.region.shortName + "-" + game.gameId + ".aof", buff);
	logger.info("Done");

	leagueRecording = false;
	mainWindow.webContents.send("recordingStatus", "Recording complete");
	mainWindow.webContents.send("lastReplay", "replays/" + game.region.shortName + "-" + game.gameId + ".aof");
};
