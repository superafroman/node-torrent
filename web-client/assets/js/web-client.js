'use strict';
var app = angular.module('web-client', ['connection', 'byte-filters', '$strap.directives']).
    config(function ($routeProvider, $locationProvider) {
        $routeProvider.
            when('/', {controller: ListCtrl, templateUrl: 'partials/list.html'}).
            when('/prefs', {controller: PrefsCtrl, templateUrl: 'partials/preferences.html'}).
            otherwise({redirectTo: '/'});

        $locationProvider.html5Mode(true);
    });

var queryPromise;
function ListCtrl($scope, $timeout, Torrents) {
    var timedQuery = function () {
        $scope.torrents = Torrents.query();
        $timeout(timedQuery, 1000);
    };

    $scope.torrents = Torrents.query();
    if (!queryPromise) {
        queryPromise = $timeout(timedQuery, 1000);
    }
}

function PrefsCtrl($scope, $location, Options) {
    $scope.options = Options.get();

    $scope.saveOptions = function () {
        Options.save($scope.options, function () {
            $location.url('/');
        });
    };
}

app.controller('MainCtrl', ['$scope', function ($scope) {
    $scope.AppName = "Node-Torrent WebApp";
}]);

app.controller('AddCtrl', function ($scope, Torrents) {
    // Torrent url supported
    var urlPattern = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;
    var magnetPattern = /magnet:\?xt=urn:\S{20,200}/i;

    $scope.torrent = {};

    $scope.saveTorrent = function () {
        if ($scope.torrent.url &&
            ((magnetPattern.test($scope.torrent.url)) ||
                urlPattern.test($scope.torrent.url))) {

            Torrents.save($scope.torrent, function () {
                $scope.torrent = {};
            });
            $scope.hide();
        }
    }
});