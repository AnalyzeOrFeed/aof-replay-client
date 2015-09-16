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
        
        $scope.settings = [ { id: 1, name: "Select LoL Client" }, { id: 2, name: "Client info" } ];
        
        $scope.showAofClientInfo = function(ev) {
            var updateText = "";
            if ($scope.aofClientInfo.newVersion) {
                updateText = "<br /><br /><strong>New Version avaliable (" + $scope.aofClientInfo.newVersion + ")</strong><br />" + $scope.aofClientInfo.msg;
            }

            $mdDialog.show(
                $mdDialog.alert()
                    .parent(angular.element(document.querySelector('#popupContainer')))
                    .clickOutsideToClose(true)
                    .title('Client info')
                    .content('v' + $scope.aofClientInfo.currVersion + updateText)
                    .ariaLabel('Client info')
                    .ok('ok')
                    .targetEvent(ev)
            );
        };
        
        $scope.announceClick = function(index) {
            if (index == 0) {
                $scope.selectClient();
            }
            if (index == 1) {
                $scope.showAofClientInfo();
            }
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
        
        ipc.send("ready");
    }
]);
