"use strict";

let fs = require("fs");
let logger;

module.exports = function(extLogger) {
    logger = extLogger;
    return {
        parse: function(file, callback) {
            let replayMetadata = {};
            let replayData = {};
            
            let buff = fs.readFileSync(file);
            let c = 0;
            
            // Read file version
            replayMetadata.version = buff.readUInt8(c);                 c += 1;
            if (replayMetadata.version < 8) {
                logger.warn("The file is using an old data format");
            } else if (replayMetadata.version == 9) {
                logger.error("This file is using a corrupted data format. Please report this to an administrator of aof.gg");
            }
            
            // Read the region id
            replayMetadata.regionId = buff.readUInt8(c);                c += 1;
            
            // Read the game id
            if (replayMetadata.version == 8) {
                replayMetadata.gameId = buff.readUInt32BE(c);           c += 4;
            } else {
                let high = buff.readUInt32BE(c);                        c += 4;
                let low = buff.readUInt32BE(c);                         c += 4;
                replayMetadata.gameId = high * 4294967296 + low;
            }
            
            // Read the riot version
            replayMetadata.riotVersion = buff.readUInt8(c);             c += 1;
            replayMetadata.riotVersion += "." + buff.readUInt8(c);      c += 1;
            replayMetadata.riotVersion += "." + buff.readUInt8(c);      c += 1;
            
            // Read additional data for the replay
            let len = buff.readUInt8(c);                                c += 1;
            replayMetadata.key = buff.toString("base64", c, c + len);   c += len;
            replayMetadata.complete = buff.readUInt8(c);                c += 1;
            replayMetadata.endStartupChunkId = buff.readUInt8(c);       c += 1;
            replayMetadata.startGameChunkId = buff.readUInt8(c);        c += 1;

            // Read the player data
            replayMetadata.players = [];
            let num = buff.readUInt8(c);                                c += 1;
            for (let i = 0; i < num; i++) {
                let p = {};
                
                p.id = buff.readInt32BE(c);                             c += 4;
                len = buff.readUInt8(c);                                c += 1;
                p.summonerName = buff.toString("utf8", c, c + len);     c += len;
                
                p.teamNr = buff.readUInt8(c);                           c += 1;
                p.leagueId = buff.readUInt8(c);                         c += 1;
                p.leagueRank = buff.readUInt8(c);                       c += 1;
                p.championId = buff.readInt32BE(c);                     c += 4;
                p.dId = buff.readInt32BE(c);                            c += 4;
                p.fId = buff.readInt32BE(c);                            c += 4;
                
                replayMetadata.players.push(p);
            }
            
            // Read the keyframes
            replayData.keyframes = [];
            if (replayMetadata.version < 11) {
                num = buff.readUInt8(c);                                c += 1;
            } else {
                num = buff.readUInt16BE(c);                             c += 2;
            }
            for (let i = 0; i < num; i++) {
                let keyframe = {};
                if (replayMetadata.version < 11) {
                    keyframe.id = buff.readUInt8(c);                    c += 1;
                } else {
                    keyframe.id = buff.readUInt16BE(c);                 c += 1;
                }
                len = buff.readInt32BE(c);                              c += 4;
                keyframe.data = new Buffer(len);
                buff.copy(keyframe.data, 0, c, c + len);                c += len;
                
                replayData.keyframes[keyframe.id] = keyframe;
            }
            
            // Read the chunks
            replayData.chunks = [];
            if (replayMetadata.version < 11) {
                num = buff.readUInt8(c);                                c += 1;
            } else {
                num = buff.readUInt16BE(c);                             c += 2;
            }
            for (let i = 0; i < num; i++) {
                let chunk = {};
                if (replayMetadata.version < 11) {
                    chunk.id = buff.readUInt8(c);                       c += 1;
                } else {
                    chunk.id = buff.readUInt16BE(c);                    c += 1;
                }
                len = buff.readInt32BE(c);                              c += 4;
                chunk.data = new Buffer(len);
                buff.copy(chunk.data, 0, c, c + len);                   c += len;
                
                replayData.chunks[chunk.id] = chunk;
            }
            
            // Calculate the last chunk id
            replayMetadata.endGameChunkId = replayData.chunks[replayData.chunks.length - 1].id;
            
            logger.info("Opened replay file %s containing %s-%s @ %s", file, replayMetadata.regionId, replayMetadata.gameId, replayMetadata.riotVersion);
            
            callback(false, replayMetadata, replayData);
        }
    };
};
