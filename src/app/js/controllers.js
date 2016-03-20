var app = angular.module('app.controllers', ['ngSanitize']);

app.controller('MainController', ['$scope', '$rootScope', '$mdDialog',
    function($scope, $rootScope, $mdDialog) {
        var ipc = require("electron").ipcRenderer;

        var matchClientVersionToReplayVersion = function() {
            if ($scope.lolClientVersion && $scope.replay && $scope.replay.riotVersion) {
                var regex = $scope.lolClientVersion.match(/(?:.*?\s)(\d+)\.(\d+)\./);
                var replay = $scope.replay.riotVersion.split('.');
                if (regex.length == 3) {
                    $scope.replayVersionMatch = (regex[1] == replay[0] && regex[2] == replay[1] );
                }
            }
        };
        
        $scope.ddragonBase = "http://ddragon.leagueoflegends.com/cdn/";
        $scope.ddragonVersion = "6.2.1/";
        $scope.loading = true;
        $scope.msg = "Loading...";
        $scope.replay = null;
        $scope.lolClientFound = false;
        $scope.lolClientVersion = "";
        $scope.lolClientVersionShort = "";
        $scope.aofClientInfo = {};
        $scope.replayVersionMatch = true;
        $scope.lolRunning = false;
        
        $scope.settings = [ { id: 1, name: "Select LoL Client" }, { id: 2, name: "Client info" }, { id: 3, name: "Send current log to aof.gg" } ];
        
        $scope.showAofClientInfo = function(event) {
            var updateText = "";
            if ($scope.aofClientInfo.newVersion) {
                updateText = "<br /><br /><strong>New Version avaliable (" + $scope.aofClientInfo.newVersion + ")</strong><br />" + $scope.aofClientInfo.msg;
            }
            
            $scope.showDialog("Client info", 'v' + $scope.aofClientInfo.currVersion + updateText, event);
        };
        $scope.showDialog = function(title, content, event) {
            $mdDialog.show({
                    templateUrl: 'app/tpl/dialog-alert.html',
                    controller: AlertController
                });

                $myScope = $scope;
            function AlertController($scope, $mdDialog) {
              $scope.title = title;
              $scope.message = content;
              $scope.openLogs = function() {
                  $mdDialog.cancel();
                  $myScope.showSendLogs();
              };
              $scope.cancel = function() {
                  $mdDialog.cancel();
              };
            }
        };

        $scope.showSendLogs = function() {
            $mdDialog.show({
                    templateUrl: 'app/tpl/dialog-sendlogs.html',
                    controller: DialogController
                })
                .then(function(data) {
                    if (data) {
                      $scope.sendLogs(data);
                    };
                });

            function DialogController($scope, $mdDialog) {
                $scope.send = function(email, comment) {
                    $mdDialog.hide({email: email, comment: comment});
                };
                $scope.cancel = function() {
                    $mdDialog.cancel();
                };
                $scope.hide = function() {
                    $mdDialog.hide();
                }
            }
        };

        $scope.announceClick = function(index) {
            if (index == 0) {
                $scope.selectClient();
            }
            if (index == 1) {
                $scope.showAofClientInfo();
            }
            if (index == 2) {
                $scope.showSendLogs();
            }
        };

        $scope.sendLogs = function(data) {
            ipc.send("sendLogs", data);
        };
        
        $scope.openFile = function() {
            ipc.send("openReplay");
        };
        
        $scope.selectClient = function() {
            ipc.send("selectClient");
        };
        
        $scope.playReplay = function() {
            ipc.send("play");
        };
        
        ipc.on("loading", function(event, obj) {
            $scope.$apply(function() {
                $scope.loading = obj.loading;
                $scope.msg = obj.msg;
            });
        });
        
        ipc.on("aofUpdate", function(event, obj) {
            $scope.$apply(function() {
                $scope.aofClientInfo = obj;
            });
        });
        
        ipc.on("staticData", function(event, obj) {
            $scope.ddragonVersion = obj.version;
        });

        ipc.on("clientInfo", function(event, obj) {
            $scope.$apply(function() {
                $scope.lolClientFound = obj.found;
                $scope.lolClientVersion = obj.version;
                console.log($scope.lolClientVersion);
                var regex = $scope.lolClientVersion.match(/(?:.*?\s)(\d+)\.(\d+)\./);
                if (regex && regex.length == 3) {
                    $scope.lolClientVersionShort = regex[1] + "." + regex[2];
                }
                matchClientVersionToReplayVersion();
            });
        });
        
        ipc.on("parsedReplayFile", function(event, obj) {
            $scope.$apply(function() {
                $scope.replay = obj;
                matchClientVersionToReplayVersion();
            });
        });
        
        ipc.on("error", function(event, obj) {
            $scope.showDialog(obj.title, obj.content);
        });
        
        ipc.on("gameSwitch", function(event, obj) {
        	$scope.lolRunning = obj;
        });

        ipc.send("ready");
    }
]);
