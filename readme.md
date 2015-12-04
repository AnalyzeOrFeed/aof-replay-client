# AnalyzeOrFeed Replay Client
[![Build Status](https://travis-ci.org/AnalyzeOrFeed/aof-replay-client.svg?branch=master)](https://travis-ci.org/AnalyzeOrFeed/aof-replay-client)

The aof.gg Replay Client is built using Electron. This means the app is compatible with both Windows and Mac. You can download the packaged files here:

[aof.gg](http://aof.gg/download/)  

---

If you would like to contribute to our client, here is how you get this repository working on your own computer:

First, make sure you have the latest version of [node.js](http://nodejs.org) and [bower](http://bower.io) installed. Then clone the repository.

````shell
$ git clone https://github.com/AnalyzeOrFeed/aof-replay-client.git aof-replay-client
````

Afterwards, you need to run
````shell
$ npm install
````
in the root directory.

That's it! You should be able to test the app by running
````shell
npm start
````

If you want to package the app, run
````shell
npm run build
````
**Note:** On Windows, you need to have 7zip command line version installed.
