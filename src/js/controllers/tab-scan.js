'use strict';

angular.module('copayApp.controllers').controller('tabScanController', function($scope, $log, $timeout, scannerService, incomingData, $state, $ionicHistory, $rootScope, platformInfo) {
  // ios camera / web scanner
  $scope.startedWebCamera = false
  $scope.canChangeWebScannerCamera = false
  $scope.webScannerCameraNumber = 0
  $scope.scannerStates = scannerStates;
  $scope.usingWebScanner = false
  var isSafari = navigator.vendor && navigator.vendor.indexOf('Apple') > -1
  var webScanner
  if (platformInfo.isIOS || isSafari) {
    $scope.usingWebScanner = true
    webScanner = new Instascan.Scanner({ video: document.getElementById('webScanner') })
    webScanner.addListener('scan', function (content) {
      handleSuccessfulScan(content)
    });
  }

  var scannerStates = {
    unauthorized: 'unauthorized',
    denied: 'denied',
    unavailable: 'unavailable',
    loading: 'loading',
    visible: 'visible'
  };
  $scope.scannerStates = scannerStates;

  function _updateCapabilities(){
    var capabilities = scannerService.getCapabilities();
    $scope.scannerIsAvailable = capabilities.isAvailable;
    $scope.scannerHasPermission = capabilities.hasPermission;
    $scope.scannerIsDenied = capabilities.isDenied;
    $scope.scannerIsRestricted = capabilities.isRestricted;
    $scope.canEnableLight = capabilities.canEnableLight;
    $scope.canChangeCamera = capabilities.canChangeCamera;
    $scope.canOpenSettings = capabilities.canOpenSettings;
  }

  function _handleCapabilities(){
    // always update the view
    $timeout(function(){
      if(!scannerService.isInitialized()){
        $scope.currentState = scannerStates.loading;
      } else if(!$scope.scannerIsAvailable){
        $scope.currentState = scannerStates.unavailable;
      } else if($scope.scannerIsDenied){
        $scope.currentState = scannerStates.denied;
      } else if($scope.scannerIsRestricted){
        $scope.currentState = scannerStates.denied;
      } else if(!$scope.scannerHasPermission){
        $scope.currentState = scannerStates.unauthorized;
      }
      $log.debug('Scan view state set to: ' + $scope.currentState);
    });
  }

  function _refreshScanView(){
    _updateCapabilities();
    _handleCapabilities();
    if($scope.scannerHasPermission){
      activate();
    }
  }

  // This could be much cleaner with a Promise API
  // (needs a polyfill for some platforms)
  $rootScope.$on('scannerServiceInitialized', function(){
    $log.debug('Scanner initialization finished, reinitializing scan view...');
    _refreshScanView();
  });


  $scope.$on("$ionicView.beforeEnter", function(event, data) {
    _handleCapabilities();
    $timeout(function() {
        _refreshScanView()
      },
      5000);
    $scope.returnRoute = data.stateParams.returnRoute || false;
  });

  $scope.$on("$ionicView.afterEnter", function() {
    // try initializing and refreshing status any time the view is entered
    if(!scannerService.isInitialized()){
      scannerService.gentleInitialize();
    }
    activate();
  });

  function isSafari() {
    var ua = navigator.userAgent.toLowerCase();
    if (ua.indexOf('safari') != -1) {
      if (ua.indexOf('chrome') > -1) {
        return "CHROME";
      } else {
        return "SAFARI";
      }
    }
    return "OTHER";
  }

  function activate(){
    $log.debug('Scanner activated, setting to visible...');
    console.log('activate() ran', $scope.currentState === scannerStates.visible, $scope.currentState)

    if ($scope.usingWebScanner) {
      Instascan.Camera.getCameras().then(function (cameras) {
        if (cameras.length > 0) {
          if (cameras.length > 1) { $scope.canChangeWebScannerCamera = true }
          $scope.startedWebCamera = true
          $scope.currentState = scannerStates.visible;
          $scope.webScannerCameraNumber = 0
          webScanner.start(cameras[0]);
        } else {
          console.error('No cameras found.');
          $scope.usingWebScanner = false
        }
      }).catch(function (e) {
        $scope.usingWebScanner = false
        console.error(e);
      });
    } else {
      scannerService.activate(function(){
        _updateCapabilities();
        _handleCapabilities();
        $log.debug('Scanner activated, setting to visible...');
        $scope.currentState = scannerStates.visible;
        // pause to update the view
        $timeout(function(){
          scannerService.scan(function(err, contents){
            if(err){
              $log.debug('Scan canceled.');
            } else if ($state.params.passthroughMode) {
              $rootScope.scanResult = contents;
              goBack();
            } else {
              handleSuccessfulScan(contents);
            }
          });
          // resume preview if paused
          scannerService.resumePreview();
        });
      })
    }
  }

  $scope.activate = activate;

  $scope.authorize = function(){
    scannerService.initialize(function(){
      _refreshScanView();
    });
  };

  $scope.$on("$ionicView.afterLeave", function() {
    scannerService.deactivate();
  });

  function handleSuccessfulScan(contents){
    $log.debug('Scan returned: "' + contents + '"');
    scannerService.pausePreview();
    var trimmedContents = contents.replace('navcoin:', '');
    if ($scope.returnRoute) {
      $state.go($scope.returnRoute, { address: trimmedContents });
    } else {
      incomingData.redir(trimmedContents);
    }
  }

  $rootScope.$on('incomingDataMenu.menuHidden', function() {
    activate();
  });

  $scope.openSettings = function(){
    scannerService.openSettings();
  };

  $scope.attemptToReactivate = function(){
    scannerService.reinitialize();
  };

  $scope.toggleLight = function(){
    scannerService.toggleLight(function(lightEnabled){
      $scope.lightActive = lightEnabled;
      $scope.$apply();
    });
  };

  $scope.toggleCamera = function(){
    $scope.cameraToggleActive = true;

    if ($scope.startedWebCamera) {
      // Set to opposite camera
      $scope.webScannerCameraNumber = $scope.webScannerCameraNumber === 0 ? 1 : 0
      Instascan.Camera.getCameras().then(function (cameras) {
        webScanner.start(cameras[$scope.webScannerCameraNumber]);
      }).catch(function (e) {
        $log.debug(JSON.stringify(e));
      });
    } else {
      scannerService.toggleCamera();
    }

    // (a short delay for the user to see the visual feedback)
    $timeout(function(){
      $scope.cameraToggleActive = false;
      $log.debug('Camera toggle control deactivated.');
    }, 200);

  };

  $scope.canGoBack = function(){
    return $state.params.passthroughMode;
  };
  function goBack(){
    $ionicHistory.nextViewOptions({
      disableAnimate: true
    });
    $ionicHistory.backView().go();
  }
  $scope.goBack = goBack;
});
