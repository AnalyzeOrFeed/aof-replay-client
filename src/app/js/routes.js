angular.module('app.routes', [])
    .config(['$routeProvider',
        function($routeProvider) {
            $routeProvider
                .when('/', {
                    templateUrl: "app/tpl/main.html"
                })
                .otherwise('/');
        }
    ]);
