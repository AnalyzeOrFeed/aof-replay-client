"use strict";

let fs      = require("fs");
let request = require("request");
let _       = require("underscore");
let logger;
let token = "???";


module.exports = function(extLogger) {
    logger = extLogger;
    return {
        checkMe: function(callback) {
            request.get("https://api.aof.gg/v2/user/checkme?token=" + token, { json: true }, function(err, response, body) {
                if (err || !response || response.statusCode != 200) return;
                console.log(body);
                let game = _.find(body, function(item) { return item.gameId != null; });
                if (game) callback(game);
                else callback();
            });
        }
    };
};
