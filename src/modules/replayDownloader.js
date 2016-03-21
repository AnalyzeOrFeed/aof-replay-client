'use strict';

var http = require('http');
var fs = require('fs');

// Save replay data
var processDownload = (gameID, host, endpoint, objectID, fileEnding, data) => {
	fs.writeFile("out/" + gameID + "-" + host + "-" + endpoint + "-" + objectID + "." + fileEnding, data, (err) => {
		if(err) {
			console.log(err);
		}
		console.log(data.length + "  The " + gameID + "-" + host + "-" + endpoint + "-" + objectID + "." + fileEnding + " file was saved!");
	});
};

// Download replay data
var download = (region, gameID, host, port, endpoint, objectID, fileEnding, cb) => {
	var options = {
		host: host,
		port: port,
		path: '/observer-mode/rest/consumer/' + endpoint + '/' + region + '/' + gameID + '/' + objectID + '/token'
	};

	http.get(options, (res) => {
		console.log('---');
		console.log(host + ':' + port + '/observer-mode/rest/consumer/' + endpoint + '/' + region + '/' + gameID + '/' + objectID + '/token');
		console.log('---');

		var body = '';
		res.on('data', (chunk) => {
			body += chunk;
		});

		res.on('end', () => {
			if (body.length > 100) {
				processDownload(gameID, host, endpoint, objectID, fileEnding, body);
				cb(objectID, body);
			}
		});
	}).on('error', (e) => {
		console.log("Got error: " + e.message);
	});
};

module.exports = (host, port, region, gameID) => {
	return {
		getGameMetaData: (cb) => {
			download(region, gameID, host, port, 'getGameMetaData', 0, 'json', cb);
		},
		getLastChunkInfo: (cb) => {
			download(region, gameID, host, port, 'getLastChunkInfo', 0, 'json', cb);
		},
		getKeyFrame: (objectID, cb) => {
			download(region, gameID, host, port, 'getKeyFrame', objectID, 'bin', cb);
		},
		getGameDataChunk: (objectID, cb) => {
			download(region, gameID, host, port, 'getGameDataChunk', objectID, 'bin', cb);
		}
	};
};