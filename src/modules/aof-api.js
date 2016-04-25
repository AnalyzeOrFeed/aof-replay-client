"use strict";

let fs      = require("fs");
let request = require("request");
let _       = require("underscore");
let logger;

let baseUrl = "https://api.aof.gg/v2/";
let token = null;


module.exports = function(extLogger) {
    logger = extLogger;
    return {
        loggedIn: function() {
            return token != null;
        },
        login: function(email, password, callback) {
            request.post(baseUrl + "auth", { json: true, body: { email: email, password: password } }, function(err, response, body) {
                if (err || !response || response.statusCode != 200) {
                    callback(false);
                    return;
                }
                
                token = body.token;
                callback(true);
            });
        },
        checkMe: function(callback) {
            request.get(baseUrl + "user/checkme?token=" + token, { json: true }, function(err, response, body) {
            	if (err || !response || response.statusCode != 200) callback();
            	let game = _.find(body, function(item) { return item.gameId != null; });
            	if (game) callback(game);
            	else callback();
            });
        }
    };
};
