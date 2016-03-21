'use strict';

let fs = require('fs');

let aofFile = require('./aof-file-parser');
let replayDownloader = require ('./replayDownloader');
// let lolAPI = require('leagueapi');

let regions = [
    {
        "Id": 5,
        "Name": "Brazil",
        "ShortName": "BR",
        "SpectatorURL": "spectator.br.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "BR1"
    },
    {
        "Id": 2,
        "Name": "Europe Nordic & East",
        "ShortName": "EUNE",
        "SpectatorURL": "spectator.eu.lol.riotgames.com",
        "SpectatorPort": 8088,
        "SpectatorPlatform": "EUN1"
    },
    {
        "Id": 1,
        "Name": "Europe West",
        "ShortName": "EUW",
        "SpectatorURL": "spectator.euw1.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "EUW1"
    },
    {
        "Id": 6,
        "Name": "Korea",
        "ShortName": "KR",
        "SpectatorURL": "spectator.kr.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "KR"
    },
    {
        "Id": 4,
        "Name": "Latin America North",
        "ShortName": "LAN",
        "SpectatorURL": "spectator.la1.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "LA1"
    },
    {
        "Id": 8,
        "Name": "Latin America South",
        "ShortName": "LAS",
        "SpectatorURL": "spectator.la2.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "LA2"
    },
    {
        "Id": 3,
        "Name": "North America",
        "ShortName": "NA",
        "SpectatorURL": "spectator.na.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "NA1"
    },
    {
        "Id": 7,
        "Name": "Oceania"
        ,"ShortName": "OCE",
        "SpectatorURL": "spectator.oc1.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "OC1"
    },
    {
        "Id": 11,
        "Name": "Public Beta Environment",
        "ShortName": "PBE",
        "SpectatorURL": "spectator.pbe1.lol.riotgames.com",
        "SpectatorPort": 8088,
        "SpectatorPlatform": "PBE1"
    },
    {
        "Id": 9
        ,"Name": "Russia",
        "ShortName": "RU",
        "SpectatorURL": "spectator.ru.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "RU"
    },
    {
        "Id": 10,
        "Name": "Turkey",
        "ShortName": "TR",
        "SpectatorURL": "spectator.tr.lol.riotgames.com",
        "SpectatorPort": 80,
        "SpectatorPlatform": "TR1"
    }
];

class Game {
    constructor(regionId, gameId) {
        regions.forEach((data) => {
            if (data.Id === regionId) {
                this.replayURL = data.SpectatorURL;
                this.replayPort = data.SpectatorPort;
                this.replayPlatform = data.SpectatorPlatform;
            }
        });
        this.regionId = regionId;
        this.gameId = gameId;

        this.keyframes = [];
        this.chunks = [];

        console.log('Initializing new game: ');
        console.log(this);
    }
/*
    // We need to get player data for a specific game
    getAPIMetadata(cb) {
        fs.readFile('config/config.json', (err, data) => {
            lolAPI.init(data.riotApiKey, 'euw');

             lol.getMatch(2552804647, true, 'euw', (err, match) => {
             console.log(match.participantIdentities[0].player);
             });

            cb();
        });
    }
*/
    downloadReplay(cb) {
        console.log('Starting to record');
        let gameRunning = true;
        let lastChunkId = 0;
        let lastKeyframeId = 0;
        let myDownloader = replayDownloader(this.replayURL, this.replayPort, this.replayPlatform, this.gameId);
        myDownloader.getGameMetaData((obj, data) => {
            //console.log(data);
            let myInterval = setInterval(() => {
                console.log("interval started");
                myDownloader.getLastChunkInfo((obj, data) => {
                    data = JSON.parse(data);
                    console.log(data);
                    console.log("interval started 2");

                    console.log(lastKeyframeId);
                    console.log(data.keyFrameId);
                    for(let i = lastKeyframeId; i <= data.keyFrameId; i++) {
                        console.log("Preparing to download keyframe " + i);
                        myDownloader.getKeyFrame(i, (objectID, body) => {
                            this.keyframes[objectID] = body;
                        })
                    }
                    lastKeyframeId = data.keyFrameId;
                    for(let i = lastChunkId; i <= data.chunkId; i++) {
                        console.log("Preparing to download chunk " + i);
                        myDownloader.getGameDataChunk(i, (objectID, body) => {
                            this.chunks[objectID] = body;
                        })
                    }
                    lastChunkId = data.nextChunkId;
                    if (data.endGameChunkId > 0 && lastChunkId === data.endGameChunkId) {
                        gameRunning = false;
                        this.saveToFile();
                        clearInterval(myInterval);

                        console.log("Game ended and file saved");
                    }
                });
            }, 30000);

            /*
              this.chunks[1] = chunkData;
              ...

              after all chunks and keyframes are downloaded, call this.saveToFile();
            */

        });
    }

    saveToFile() {
        aofFile.save(this, '', this.regionId + '-' + this.gameId, (err) => {console.log(err)})
    }
}

module.exports = Game;