/**
 * ---- directives.js ----
 * User: David Yahalomi
 * Date: 21/05/13
 * Time: 23:08
 */
angular.module('ui-directives',
        // dependencies
        [ 'ui.bootstrap.tooltip'])
    .directive('popoverHtmlPopup', function () {
        return {
            restrict: 'E',
            replace: true,
            scope: { content: '@', placement: '@', animation: '&', isOpen: '&' },
            templateUrl: 'partials/directives/popover/popover-html-popup.html',
            controller: 'GetTemplateCtrl',
            link: function postLink(scope, element, attrs, getTemplateCtrl) {
                getTemplateCtrl.getTemplateByURL(scope.$parent.tt_content, function (data, status) {
                    if (status == 200){
                        scope.content = data;
                    } else {
                        scope.content = getTemplateCtrl.error();
                    }
                });
            }
        };
    })
    .directive('popoverHtml', ['$tooltip', function ($tooltip) {
        return $tooltip('popoverHtml', 'popoverHtml', 'click');
    }]);

function GetTemplateCtrl($log, $http, $templateCache) {
    this.error = function () {
        return $templateCache.get("partials/error/notfound.html");
    };

    this.getTemplateByURL = function (url, finishCb) {
        if (url) {
            $http({method: 'GET', url: url, cache: true}).
                success(finishCb).
                error(finishCb);
        } else {
            finishCb(this.error());
        }
    }
}