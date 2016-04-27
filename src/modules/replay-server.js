"use strict";

let http = require("http");
let logger;

let chunkId = 1;
let lastChunkInfo = "{\"chunkId\":$cid,\"availableSince\":30000,\"nextAvailableChunk\":$nac,\"keyFrameId\":$kid,\"nextChunkId\":0,\"endStartupChunkId\":$endStartupChunkId,\"startGameChunkId\":$startGameChunkId,\"endGameChunkId\":$endGameChunkId,\"duration\":30000}";

let replay = {};
let data = {};
let webHost = "127.0.0.1";
let webPort;

let server;

module.exports = function(extLogger) {
    logger = extLogger;
    return {
        host: function() {
            return server.address().address;
        },
        port: function() {
            return server.address().port;
        },
        startServer: function() {
            server = http.createServer(function handleRequest(request, response) {
                logger.info("Requesting: " + request.url);
                
                if (request.url.indexOf("/observer-mode/rest/consumer/version") > -1) {
                    response.end("1.82.102");
                } else if (request.url.indexOf("/observer-mode/rest/consumer/getGameMetaData/") > -1) {
                    response.end("{\"gameKey\":{\"gameId\":0,\"platformId\":\"aof\"},\"gameServerAddress\":\"\",\"port\":0,\"" +
                        "encryptionKey\":\"\",\"chunkTimeInterval\":30000,\"startTime\":\"???\",\"gameEnded\":true,\"lastChunkId\":1,\"lastKeyFrameId\":1,\"endStartupChunkId\":1,\"" +
                        "delayTime\":150000,\"pendingAvailableChunkInfo\":[],\"pendingAvailableKeyFrameInfo\":[],\"keyFrameTimeInterval\":60000,\"decodedEncryptionKey\":\"\",\"" +
                        "startGameChunkId\":1,\"gameLength\":0,\"clientAddedLag\":30000,\"clientBackFetchingEnabled\":false,\"clientBackFetchingFreq\":1000,\"interestScore\":0,\"" +
                        "featuredGame\":false,\"createTime\":\"???\",\"endGameChunkId\":-1,\"endGameKeyFrameId\":-1}");
                } else if (request.url.indexOf("/observer-mode/rest/consumer/getLastChunkInfo/") > -1) {
                    let info = lastChunkInfo.replace("$cid", chunkId);
                    info = info.replace("$kid", Math.floor((Math.max(Math.floor((chunkId - replay.startGameChunkId) / 2) + 1, 0))));
                    info = info.replace("$nac", chunkId == replay.endStartupChunkId ? "30000" : "1000");
                    info = info.replace("$endStartupChunkId", replay.endStartupChunkId);
                    info = info.replace("$startGameChunkId", replay.startGameChunkId);
                    info = info.replace("$endGameChunkId", replay.endGameChunkId);
                    response.end(info);
                } else if (request.url.indexOf("/observer-mode/rest/consumer/getGameDataChunk/") > -1) {
                    let regex = /getGameDataChunk\/([a-zA-Z0-9]+)\/([0-9]+)\/([0-9]+)\/token/g;
                    let cid = Number(regex.exec(request.url)[3]);
                    if (data.chunks[cid]) {
                        response.setHeader("Content-Type", "application/octet-stream");
                        response.setHeader("Content-Length", data.chunks[cid].data.length);
                        response.write(data.chunks[cid].data);
                        response.end();
                    } else {
                        response.setHeader("Content-Type", "application/octet-stream");
                        response.setHeader("Content-Length", 0);
                        response.end();
                    }
                    chunkId = cid + 1;
                } else if (request.url.indexOf("/observer-mode/rest/consumer/getKeyFrame/") > -1) {
                    let regex = /getKeyFrame\/([a-zA-Z0-9]+)\/([0-9]+)\/([0-9]+)\/token/g;
                    let kid = Number(regex.exec(request.url)[3]);
                    if (data.keyframes[kid]) {
                        response.setHeader("Content-Type", "application/octet-stream");
                        response.setHeader("Content-Length", data.keyframes[kid].data.length);
                        response.write(data.keyframes[kid].data);
                        response.end();
                    } else {
                        response.setHeader("Content-Type", "application/octet-stream");
                        response.setHeader("Content-Length", 0);
                        response.end();
                    }
                }
            });
            server.listen(0, webHost, function() {
                logger.info("Server listening on: %s:%s", server.address().address, server.address().port);
            });
        },
        loadReplay: function(replayMetadata, replayData) {
            replay = replayMetadata;
            data = replayData;
            this.resetReplay();
        },
        resetReplay: function() {
            chunkId = 1;
        },
    };
};
