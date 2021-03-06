(function() {
	'use strict';

	var
		{Cc, Ci} = require('chrome'),
		main = require('wappalyzer'),
		w = main.wappalyzer,
		tabCache = {},
		headersCache = {},
		categoryNames = {},
		data = require('sdk/self').data,
		ss = require('sdk/simple-storage'),
		sp = require("sdk/simple-prefs"),
		tabs = require('sdk/tabs'),
		panel = require('sdk/panel').Panel({
			width: 250,
			height: 50,
			contentURL: data.url('panel.html'),
			contentScriptFile: data.url('js/panel.js')
		}),
		widget = require('sdk/widget').Widget({
			id: 'wappalyzer',
			label: 'Wappalyzer',
			contentURL: data.url('images/icon32.png'),
			panel: panel
		}),
		initTab;

	initTab = function(tab) {
		var worker = tab.attach({
			contentScriptFile: data.url('js/tab.js')
		});

		worker.port.on('analyze', function(message) {
			if ( headersCache[tab.url] !== undefined ) {
				message.analyze.headers = headersCache[tab.url];
			}

			w.analyze(message.hostname, message.url, message.analyze);
		});

		worker.port.on('log', function(message) {
			w.log('[ tab.js ] ' + message);
		});
	}

	tabs.on('open', function(tab) {
		tabCache[tab.id] = { count: 0, appsDetected: [] };
	});

	tabs.on('close', function(tab) {
		tabCache[tab.id] = null;
	});

	tabs.on('activate', function(tab) {
		w.driver.displayApps();

		tabs.activeTab.on('ready', function(tab) {
			initTab(tab);
		});
	});

	panel.port.on('resize', function(height) {
		panel.height = height;
	});

	w.driver = {
		/**
		 * Log messages to console
		 */
		log: function(args) {
			console.log(args.message);
		},

		/**
		 * Initialize
		 */
		init: function(callback) {
			var json = JSON.parse(data.load('apps.json'));

			try {
				var version = require('sdk/self').version;

				if ( !ss.storage.version ) {
					w.driver.goToURL({ url: w.config.websiteURL + 'installed', medium: 'install' });
				} else if ( version !== ss.storage.version ) {
					w.driver.goToURL({ url: w.config.websiteURL + 'upgraded', medium: 'upgrade' });
				}

				ss.storage.version = version;
			} catch(e) { }

			w.apps = json.apps;
			w.categories = json.categories;

			for ( var id in w.categories ) {
				categoryNames[id] = require('sdk/l10n').get('cat' + id);
			}

			for each ( var tab in tabs ) {
				tabCache[tab.id] = { count: 0, appsDetected: [] };

				initTab(tab);
			}

			var httpRequestObserver = {
				init: function() {
					var observerService = Cc['@mozilla.org/observer-service;1'].getService(Ci.nsIObserverService);

					observerService.addObserver(this, 'http-on-examine-response', false);
				},

				observe: function(subject, topic, data) {
					if ( topic == 'http-on-examine-response' ) {
						subject.QueryInterface(Ci.nsIHttpChannel);

						this.onExamineResponse(subject);
					}
				},

				onExamineResponse: function (subject) {
					if ( headersCache.length > 50 ) {
						headersCache = {};
					}

					if ( subject.contentType === 'text/html' ) {
						if ( headersCache[subject.URI.spec] === undefined ) {
							headersCache[subject.URI.spec] = {};
						}

						subject.visitResponseHeaders(function(header, value) {
							headersCache[subject.URI.spec][header.toLowerCase()] = value;
						});
					}
				}
			};

			httpRequestObserver.init();
		},

		goToURL: function(args) {
			var url = args.url + ( typeof args.medium === 'undefined' ? '' :  '?utm_source=firefox&utm_medium=' + args.medium + '&utm_campaign=extensions');

			tabs.open(url);
		},

		displayApps: function() {
			var count = w.detected[tabs.activeTab.url] ? Object.keys(w.detected[tabs.activeTab.url]).length.toString() : '0';

			w.log('display apps');

			if ( tabCache[tabs.activeTab.id] === undefined ) {
				tabCache[tabs.activeTab.id] = { count: 0, appsDetected: [] };
			}

			tabCache[tabs.activeTab.id].count = count;
			tabCache[tabs.activeTab.id].appsDetected = w.detected[tabs.activeTab.url];

			widget.contentURL = data.url('images/icon32.png');

			if ( count > 0 ) {
				// Find the main application to display
				var i, appName, found = false;

				widget.contentURL = data.url('images/icon32_hot.png'),

				w.driver.categoryOrder.forEach(function(match) {
					for ( appName in w.detected[tabs.activeTab.url] ) {
						w.apps[appName].cats.forEach(function(cat) {
							if ( cat == match && !found ) {
								widget.contentURL = data.url('images/icons/' + appName + '.png'),

								found = true;
							}
						});
					}
				});
			};

			panel.port.emit('displayApps', { tabCache: tabCache[tabs.activeTab.id], apps: w.apps, categories: w.categories, categoryNames: categoryNames });
		},

		ping: function() {
			var Request = require('sdk/request').Request;

			if ( Object.keys(w.ping.hostnames).length && sp.prefs.tracking ) {
				Request({
					url: w.config.websiteURL + 'ping/v2/',
					content: { json: encodeURIComponent(JSON.stringify(w.ping)) },
					onComplete: function (response) {
						w.log('w.driver.ping: status ' + response.status);
					}
				}).post();

				w.log('w.driver.ping: ' + JSON.stringify(w.ping));

				w.ping = { hostnames: {} };
			}
		},

		categoryOrder: [ // Used to pick the main application
			 1, // CMS
			11, // Blog
			 6, // Web Shop
			 2, // Message Board
			 8, // Wiki
			13, // Issue Tracker
			30, // Web Mail
			18, // Web Framework
			21, // LMS
			 7, // Photo Gallery
			 3, // Database Manager
			34, // Database
			 4, // Documentation Tool
			 9, // Hosting Panel
			29, // Search Engine
			12, // Javascript Framework
			26, // Mobile Framework
			25, // Javascript Graphics
			22, // Web Server
			27, // Programming Language
			28, // Operating System
			15, // Comment System
			20, // Editor
			10, // Analytics
			32, // Marketing Automation
			38, // Media Server
			31, // CDN
			23, // Cache Tool
			17, // Font Script
			24, // Rich Text Editor
			35, // Map
			 5, // Widget
			14, // Video Player
			16, // Captcha
			33, // Web Server Extension
			37, // Network Device
			39, // Webcam
			40, // Printer
			36, // Advertising Network
			19  // Miscellaneous
		]
	}

	w.init();
}());
