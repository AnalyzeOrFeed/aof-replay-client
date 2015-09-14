"use strict";

let fs = require("fs");
let winreg = require("winreg");
let spawn = require("child_process").spawn;
let _ = require("underscore");

let leaguePath = false;
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
let checkPath = function() {
	try {
		let logPath = leaguePath + "/../Logs/Game - R3d Logs/";
		
		let files = fs.readdirSync(logPath);		
		files.sort(function(a, b) {
			return fs.statSync(logPath + b).mtime.getTime() - fs.statSync(logPath + a).mtime.getTime();
		});
		let content = fs.readFileSync(logPath + files[0], "utf8");
		leagueVersion = content.substring(content.indexOf("Build Version:") + 15, content.indexOf("[PUBLIC]") - 1);
		console.log("LoL client version is: " + leagueVersion);
		
		files = fs.readdirSync(leaguePath + "/solutions/lol_game_client_sln/releases/");
		leaguePath += "/solutions/lol_game_client_sln/releases/" + files[0] + "/deploy/";
		console.log("Complete league path is " + leaguePath);
		
		return true;
	} catch (err) {
		console.log("Did not recognize " + leaguePath + "/solutions/lol_game_client_sln/releases/ as a LoL client directory: " + err);
		leaguePath = false;
		leagueVersion = "";
		return false;
	}
};

// Try and find the specified registry key
let findRegKey = function(hive, key, callback) {
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

module.exports = {
	isFound: function() {
		return leaguePath !== false;
	},
	version : function() {
		return leagueVersion;
	},
	find: function() {
		leaguePath = false;
		leagueVersion = "";
		
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
								console.log("Checking possible LoL client @ " + possiblePaths[k]);
								leaguePath = possiblePaths[k];
								if (checkPath())
									break;
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
					checkPath();
				}
			});
		}
	},
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
	extractPath: function(file) {
		leaguePath = false;
		leagueVersion = "";
		if (process.platform == "win32") {
			let i = file.indexOf("RADS/solutions/") + 5;
			if (i === 4)
				i = file.indexOf("RADS\\solutions\\") + 5;
			if (i === 4)
				return;
			leaguePath = file.substring(0, i);
		} else if (process.platform == "darwin") {
			leaguePath = file + "/Contents/LoL/RADS";
		}
		console.log("League path set to " + leaguePath);
		checkPath();
	},
};
