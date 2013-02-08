angular.module('torrent-client', ['connection']).
	config(function ($routeProvider) {
		$routeProvider.
			when('/', {controller:ListCtrl, templateUrl:'list.html'}).
			when('/new', {controller:CreateCtrl, templateUrl:'add.html'}).
				otherwise({redirectTo:'/'});
	});

function ListCtrl($scope, Torrent) {
	$scope.torrents = Torrent.query();
}

function CreateCtrl($scope, Torrent) {
	$scope.save = function() {
		Torrent.save($scope.torrent)
	}
}