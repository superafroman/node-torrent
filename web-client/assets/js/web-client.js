var app = angular.module('web-client', ['connection', 'byte-filters', 'ui.bootstrap', 'ui-directives']).
    config(function ($routeProvider) {
        $routeProvider.
            when('/', {controller: ListCtrl, templateUrl: 'partials/list.html'}).
            otherwise({redirectTo: '/'});
    });

function ListCtrl($scope, $location, $timeout, Torrents) {
    function timedQuery() {
        $timeout(function() {
            $scope.torrents = Torrents.query();
            timedQuery();
        },($scope.torrents && $scope.torrents.length > 0 ? 1000 : 5000));
    }
    timedQuery();

    // Torrent url supported
    var urlPattern = /(http|ftp|https):\/\/[\w-]+(\.[\w-]+)+([\w.,@?^=%&amp;:\/~+#-]*[\w@?^=%&amp;\/~+#-])?/;
    var magnetPattern = /magnet:\?xt=urn:\S{20,200}/i;

    $scope.save = function () {
        if ($scope.torrent.url &&
            ((magnetPattern.test($scope.torrent.url)) ||
                urlPattern.test($scope.torrent.url))) {

            Torrents.save($scope.torrent, function () {
                $location.path('/');
            });
        }
    }
}