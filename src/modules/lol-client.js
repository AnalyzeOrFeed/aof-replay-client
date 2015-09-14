"use strict";

let fs = require("fs");
let winreg = require("winreg");
let spawn = require("child_process").spawn;

let leaguePath = false;
let leagueVersion = "";

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

module.exports = {
	isFound: function() {
		return leaguePath !== false;
	},
	version : function() {
		return leagueVersion;
	},
	find: function() {
		if (process.platform == "win32") {
			// Try getting the key from the win32 registry
			let regKey = new winreg({
				hive: winreg.HKCU,
				key:  "\\Software\\Riot Games\\RADS"
			});
			regKey.get("LocalRootFolder", function(err, item) {
				if (err) {
					console.log("Couldn't find registry key HKCU\\Software\\Riot Games\\RADS");
					
					// Try getting the key from the win64 registry
					regKey = new winreg({
						hive: winreg.HKCU,
						key:  "\\Software\\Wow6432Node\\Riot Games\\RADS"
					});
					regKey.get("LocalRootFolder", function(err, item) {
						if (err) {
							console.log("Couldn't find registry key HKCU\\Software\\Wow6432Node\\Riot Games\\RADS");
						} else {
							leaguePath = item.value;
							console.log("Possible LoL client @ " + leaguePath);
							checkPath();
						}
					});
				} else {
					leaguePath = item.value;
					console.log("Possible LoL client @ " + leaguePath);
					checkPath();
				}
			});
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
