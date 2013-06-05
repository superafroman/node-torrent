var app = angular.module('web-client', ['connection', 'byte-filters', '$strap.directives']).
    config(function ($routeProvider) {
        $routeProvider.
            when('/', {controller: ListCtrl, templateUrl: 'partials/list.html'}).
            when('/prefs', {controller: PrefsCtrl, templateUrl: 'partials/preferences.html'}).
            otherwise({redirectTo: '/'});
    });

function ListCtrl($scope, $timeout, Torrents) {
    function timedQuery() {
        $timeout(function () {
            $scope.torrents = Torrents.query();
            timedQuery();
        }, ($scope.torrents && $scope.torrents.length > 0 ? 1000 : 5000));
    }

    timedQuery();
}

function PrefsCtrl($scope, Options) {
    $scope.options = Options.query();

    $scope.saveOptions = function () {
        Options.save($scope.options);
    };
}

app.controller('AddCtrl', function ($scope, $log, Torrents) {
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