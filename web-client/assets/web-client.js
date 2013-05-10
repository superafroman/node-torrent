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

function CreateCtrl($scope, Torrents) {
//	$scope.save = function() {
//		Torrent.save($scope.torrent)
//	}
}