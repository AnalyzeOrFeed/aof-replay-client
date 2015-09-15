"use strict";

let fs = require("fs");
let winreg = require("winreg");
let spawn = require("child_process").spawn;
let _ = require("underscore");

let leaguePath = false;
let fullPath = false;
let leagueVersion = "";
let regexLocations = [{
	hive: winreg.HKCU,
	keys: [
		"\\Software\\Riot Games\\RADS",
		"\\Software\\Wow6432Node\\Riot Games\\RADS",
		"\\Software\\Classes\\VirtualStore\\MACHINE\\SOFTWARE\\Wow6432Node\\RIOT GAMES\\RADS",
		"\\Software\\Classes\\VirtualStore\\MACHINE\\SOFTWARE\\RIOT GAMES\\RADS",
	]
},{
	hive: winreg.HKLM,
	keys: [
		"\\Software\\Wow6432Node\\Riot Games\\RADS",
		"\\Software\\RIOT GAMES\\RADS",
	]
}];

// Try and find the league of legends client
function checkPath(callback) {
	let logPath = leaguePath + "/../Logs/Game - R3d Logs/";
	
	var errorCallback = function(err) {
		console.log("Error checking path " + logPath + ": " + err);
		leaguePath = false;
		leagueVersion = "";
		callback(false);
	};
	
	fs.readdir(logPath, function(err, files) {
		if (err) {
			errorCallback(err);
		} else {
			files.sort(function(a, b) {
				return fs.statSync(logPath + b).mtime.getTime() - fs.statSync(logPath + a).mtime.getTime();
			});
			
			fs.readFile(logPath + files[0], "utf8", function(err, content) {
				if (err) {
					errorCallback(err);
				} else {
					leagueVersion = content.substring(content.indexOf("Build Version:") + 15, content.indexOf("[PUBLIC]") - 1);
					console.log("LoL client version is: " + leagueVersion);
					
					fs.readdir(leaguePath + "/solutions/lol_game_client_sln/releases/", function(err, files) {
						if (err) {
							errorCallback(err);
						} else {
							fullPath = leaguePath + "/solutions/lol_game_client_sln/releases/" + files[0] + "/deploy/";
							console.log("Complete league path is " + fullPath);
							
							callback(true);
						}
					});
				}
			});
		}
	});
};

// Try and find the specified registry key
function findRegKey(hive, key, callback) {
	let regKey = new winreg({
		hive: hive,
		key:  key
	});
	regKey.get("LocalRootFolder", function(err, item) {
		if (err) {
			console.log("Couldn't find registry key " + hive + key);
			callback()
		} else {
			callback(item.value);
		}
	});
};

// Try and find the league client
function find(hintPath, callback) {
	leaguePath = false;
	leagueVersion = "";
	
	// Try the hint path if we have one
	if (hintPath) {
		leaguePath = hintPath;
		checkPath(function(found) {
			if (!found)
				find(false, callback);
			else
				callback(true);
		});
	} else {
		if (process.platform == "win32") {
			// Try finding the key in all the registry locations
			let possiblePaths = [];
			let c = 0;
			let num = _.reduce(regexLocations, function(memo, item) { return memo + item.keys.length; }, 0);
			for (let i = 0; i < regexLocations.length; i++) {
				for (let j = 0; j < regexLocations[i].keys.length; j++) {
					findRegKey(regexLocations[i].hive, regexLocations[i].keys[j], function(path) {
						if (path && !_.contains(possiblePaths, path)) {
							possiblePaths.push(path);
						}
						c++;
						
						if (c == num) {
							for (let k = 0; k < possiblePaths.length; k++) {
								if (leaguePath)
									break;
								
								console.log("Checking possible LoL client @ " + possiblePaths[k]);
								leaguePath = possiblePaths[k];
								checkPath(callback);
							}
						}
					});
				}
			}
		} else if (process.platform == "darwin") {
			fs.access("/Applications/League of Legends.app", function(err) {
				if (err) {
					console.log("Could not find LoL client at the default Mac path");
				} else {
					leaguePath = "/Applications/League of Legends.app/Contents/LoL/RADS";
					console.log("Possible LoL client @ " + leaguePath);
					checkPath(callback);
				}
			});
		}	
	}
}

module.exports = {
	leaguePath: function() {
		return leaguePath;
	},
	isFound: function() {
		return leaguePath !== false;
	},
	version : function() {
		return leagueVersion;
	},
	find: find,
	launch: function(host, port, replayRegionName, replayGameId, replayKey, callback) {
		// Ask for LoL client path if we didn't find it
		if (!leaguePath) {
			return false;
		}
		
		// Set LoL client executable/app name
		let exe = "";
		if (process.platform == "win32") {
			exe = "League of Legends.exe";
		} else if (process.platform == "darwin") {
			exe = "LeagueOfLegends.app";
		}
		
		// Set arguments
		let args = ["8394", "LoLLauncher.exe", "", "spectator " + host + ":" + port + " " + replayKey + " " + replayGameId + " " + replayRegionName];
		
		// Set options
		let opts = { stdio: "ignore" };
		if (process.platform == "win32") {
			opts.cwd = leaguePath;
		} else if (process.platform == "darwin") {
			opts.cwd = leaguePath + exe + "/Contents/MacOS";
			process.env["riot_launched"] = true;
		}
		
		// Set command
		let cmd = "";
		if (process.platform == "win32") {
			cmd = leaguePath + exe;
		} else if (process.platform == "darwin") {
			cmd = opts.cwd + "/LeagueofLegends";
		}
		
		// Run LoL client
		let client = spawn(cmd, args, opts);
		client.on("error", function (err) {
			if (err) {
				console.log("!!! ERROR WHILE RUNNING THE LEAGUE OF LEGENDS CLIENT !!!");
				console.log(err);
			} else {
				console.log("League of Legends client executed successfully");
			}
		});
		client.on("close", function (code) {
			callback();
		});
		
		return true;
	},
	extractPath: function(file, callback) {
		file = file.replace(/\\/g, "/");
		leaguePath = false;
		leagueVersion = "";
		if (process.platform == "win32") {
			let i = file.indexOf("RADS/solutions/") + 5;
			if (i > 4) {
				leaguePath = file.substring(0, i);
			} else if ((i = file.indexOf("League of Legends/") + 18) > 17) {
				leaguePath = file.substring(0, i) + "RADS";
			}
		} else if (process.platform == "darwin") {
			leaguePath = file + "/Contents/LoL/RADS";
		}
		console.log("League path set to " + leaguePath);
		
		if (leaguePath)
			checkPath(callback);
		else
			callback(false);
	},
};
