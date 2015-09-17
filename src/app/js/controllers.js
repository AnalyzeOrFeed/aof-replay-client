var app = angular.module('app.controllers', []);

app.controller('MainController', ['$scope', '$rootScope', '$mdDialog',
    function($scope, $rootScope, $mdDialog) {
        
        var ipc = require('ipc');
        
        $scope.loading = true;
        $scope.msg = "Loading...";
        $scope.replay = null;
        $scope.lolClientFound = false;
        $scope.lolClientVersion = "";
        $scope.aofClientInfo = {};
        
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
        
        $scope.announceClick = function(index) {
            if (index == 0) {
                $scope.selectClient();
            }
            if (index == 1) {
                $scope.showAofClientInfo();
            }
            if (index == 2) {
                $scope.sendLogs();
            }
        };

        $scope.sendLogs = function() {
            ipc.send("sendLogs");
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
                $scope.loading = obj.loading
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
            });
        });
        
        ipc.on("parsedReplayFile", function(obj) {
            $scope.$apply(function() {
                $scope.replay = obj;
            });
        });
        
        ipc.on("error", function(obj) {
            $scope.showDialog(obj.title, obj.content);
        });
        
        ipc.send("ready");
    }
]);
