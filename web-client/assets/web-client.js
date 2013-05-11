angular.module('web-client', ['connection']).
    config(function ($routeProvider) {
        $routeProvider.
            when('/', {controller: ListCtrl, templateUrl: 'list.html'}).
            when('/new', {controller: CreateCtrl, templateUrl: 'add.html'}).
            otherwise({redirectTo: '/'});
    });

function ListCtrl($scope, Torrents) {
    $scope.torrents = Torrents.query();
}

function CreateCtrl($scope, $location, Torrents) {
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