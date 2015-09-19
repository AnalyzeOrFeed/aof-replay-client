var app = angular.module('app.controllers', []);

app.controller('MainController', ['$scope', '$rootScope', '$mdDialog',
    function($scope, $rootScope, $mdDialog) {
        
        var ipc = require('ipc');

        var matchClientVersionToReplayVersion = function() {
            if ($scope.lolClientVersion && $scope.replay && $scope.replay.riotVersion) {
                var regex = $scope.lolClientVersion.match(/(?:.*?\s)(\d+)\.(\d+)\./);
                var replay = $scope.replay.riotVersion.split('.');
                if (regex.length == 3) {
                    $scope.replayVersionMatch = (regex[1] == replay[0] && regex[2] == replay[1] );
                }
            }
        };

        $scope.loading = true;
        $scope.msg = "Loading...";
        $scope.replay = null;
        $scope.lolClientFound = false;
        $scope.lolClientVersion = "";
        $scope.lolClientVersionShort = "";
        $scope.aofClientInfo = {};
        $scope.replayVersionMatch = true;

        $scope.settings = [ { id: 1, name: "Select LoL Client" }, { id: 2, name: "Client info" }, { id: 3, name: "Send current log to aof.gg" } ];
        
        $scope.showAofClientInfo = function(event) {
            var updateText = "";
            if ($scope.aofClientInfo.newVersion) {
                updateText = "<br /><br /><strong>New Version avaliable (" + $scope.aofClientInfo.newVersion + ")</strong><br />" + $scope.aofClientInfo.msg;
            }
            
            $scope.showDialog("Client info", 'v' + $scope.aofClientInfo.currVersion + updateText, event);
        };
        $scope.showDialog = function(title, content, event) {
            $mdDialog.show(
                $mdDialog.alert()
                    .parent(angular.element(document.querySelector('#popupContainer')))
                    .clickOutsideToClose(true)
                    .title(title)
                    .content(content)
                    .ariaLabel(title)
                    .ok('ok')
                    .targetEvent(event)
            );
        };

        $scope.showSendLogs = function() {
            $mdDialog.show({
                    templateUrl: 'app/tpl/dialog-sendlogs.html',
                    controller: DialogController
                })
                .then(function(comment) {
                    $scope.sendLogs(comment);
                });

            function DialogController($scope, $mdDialog) {
                $scope.send = function(comment) {
                    $mdDialog.hide(comment);
                };
                $scope.cancel = function() {
                    $mdDialog.cancel();
                };
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

        $scope.sendLogs = function(comment) {
            ipc.send("sendLogs", comment);
        };
        
        $scope.openFile = function() {
            ipc.send("openReplay");
        };
        
        $scope.selectClient = function() {
            ipc.send("selectClient");
        };
        
        $scope.playReplay = function() {
            console.log("playing");
            ipc.send("play");
        };
        
        ipc.on("loading", function(obj) {
            $scope.$apply(function() {
                $scope.loading = obj.loading;
                $scope.msg = obj.msg;
            });
        });
        
        ipc.on("aofUpdate", function(obj) {
            $scope.$apply(function() {
                $scope.aofClientInfo = obj;
            });
        });
        
        ipc.on("clientInfo", function(obj) {
            $scope.$apply(function() {
                $scope.lolClientFound = obj.found;
                $scope.lolClientVersion = obj.version;
                var regex = $scope.lolClientVersion.match(/(?:.*?\s)(\d+)\.(\d+)\./);
                if (regex.length == 3) {
                    $scope.lolClientVersionShort = regex[1] + "." + regex[2];
                }
                matchClientVersionToReplayVersion();
            });
        });
        
        ipc.on("parsedReplayFile", function(obj) {
            $scope.$apply(function() {
                $scope.replay = obj;
                matchClientVersionToReplayVersion();
            });
        });
        
        ipc.on("error", function(obj) {
            $scope.showDialog(obj.title, obj.content);
        });
        
        ipc.send("ready");
    }
]);
