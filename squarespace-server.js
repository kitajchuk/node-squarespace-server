/*!
 *
 * Squarespace node server.
 *
 * - Cache conventions
 *      - block-*.html
 *      - query-*.json
 *      - page-*.json
 *      - page-*.html
 *      - api-*.json
 *
 */
var bodyParser = require( "body-parser" ),
    express = require( "express" ),
    path = require( "path" ),
    fs = require( "fs" ),
    slug = require( "slug" ),

    rProtocol = /^https:|^http:/g,
    rSlash = /^\/|\/$/g,
    rIco = /\.ico$/,
    rApi = /^\/api/,
    rUniversal = /^\/universal/,
    rClickthroughUrl = /^\/s\//,
    sqsUser = null,
    sqsTimeOfLogin = null,
    sqsTimeLoggedIn = 86400000,
    directories = {},
    templateConfig = null,
    serverConfig = null,
    templateConfigPath = path.join( process.cwd(), "template.conf" ),
    expressApp = express(),
    loginHTML = "",
    fourOhFourHTML = "",

    sqsLogger = require( "node-squarespace-logger" ),
    sqsMiddleware = require( "node-squarespace-middleware" ),
    sqsUtil = require( "./squarespace-util" ),
    sqsTemplate = require( "./squarespace-template" ),
    sqsCache = require( "./squarespace-cache" ),
    package = sqsUtil.readJson( path.join( __dirname, "package.json" ) ),


/**
 *
 * serverConfig = {
 *      siteurl,
 *      port,
 *      webroot,
 *      protocol,
 *      siteData,
 *      password
 * };
 *
 * @method setServerConfig
 * @param {object} conf The parsed template.conf
 * @private
 *
 */
setServerConfig = function ( conf ) {
    serverConfig = conf.server;

    serverConfig.siteurl = serverConfig.siteurl.replace( rSlash, "" );
    serverConfig.port = (serverConfig.port || 5050);
    serverConfig.webroot = process.cwd();
    serverConfig.protocol = serverConfig.siteurl.match( rProtocol )[ 0 ];
    serverConfig.siteData = {};

    // Set config for middleware
    sqsMiddleware.set( "siteurl", serverConfig.siteurl );

    if ( serverConfig.password ) {
        sqsMiddleware.set( "sitepassword", serverConfig.password );
    }

    if ( serverConfig.sandbox ) {
        sqsMiddleware.set( "sandboxmode", true );
    }

    sqsTemplate.setConfig( "server", serverConfig );
},


/**
 *
 * @method setTemplateConfig
 * @param {object} conf The parsed template config object
 * @private
 *
 */
setTemplateConfig = function ( conf ) {
    templateConfig = conf;

    delete templateConfig.server;

    sqsTemplate.setConfig( "template", templateConfig );
},


/**
 *
 * @method setDirectories
 * @returns {object}
 * @private
 *
 */
setDirectories = function () {
    // @global - directories
    directories = {
        blocks: path.join( serverConfig.webroot, "blocks" ),
        collections: path.join( serverConfig.webroot, "collections" ),
        assets: path.join( serverConfig.webroot, "assets" ),
        pages: path.join( serverConfig.webroot, "pages" ),
        scripts: path.join( serverConfig.webroot, "scripts" ),
        styles: path.join( serverConfig.webroot, "styles" ),
        presets: path.join( serverConfig.webroot, "presets" )
    };

    // Set directories on external modules
    sqsTemplate.setDirs( directories );
},


/**
 *
 * @method renderResponse
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
renderResponse = function ( appRequest, appResponse ) {
    var cacheHtml = null,
        cacheJson = null,
        cacheName = null,
        slugged = slug( appRequest.params[ 0 ].replace( /\//g, "-" ).replace( /-$/g, "" ) ),
        reqSlug = ( slugged === "" ) ? "-homepage" : slugged,
        url = appRequest.params[ 0 ],
        qrs = {};

    cacheName = ("page" + reqSlug);

    // Querystring?
    for ( var i in appRequest.query ) {
        qrs[ i ] = appRequest.query[ i ];

        // Unique cache file name including queries
        if ( i !== "format" && i !== "password" && i !== "nocache" ) {
            cacheName += ("-" + i + "--" + qrs[ i ]);
        }
    }

    cacheHtml = sqsCache.get( (cacheName + ".html") );
    cacheJson = sqsCache.get( (cacheName + ".json") );

    // Nocache?
    if ( appRequest.query.nocache !== undefined ) {
        cacheJson = null;
        cacheHtml = null;

        sqsCache.remove( (cacheName + ".html") );
        sqsCache.remove( (cacheName + ".json") );
    }

    // Search?
    if ( slugged === "search" ) {
        if ( cacheHtml ) {
            appResponse.status( 200 ).send( cacheHtml );

        } else {
            sqsMiddleware.getHtml( url, qrs, function ( error, data ) {
                if ( !error ) {
                    appResponse.status( 200 ).send( data.html );

                    sqsCache.set( (cacheName + ".html"), data.html );

                } else {
                    // Handle errors
                    sqsLogger.log( "error", ("Error requesting system search page => " + error) );
                }
            });
        }

        return;
    }

    // Cache?
    if ( cacheJson && cacheHtml && appRequest.query.format !== "json" ) {
        sqsTemplate.renderTemplate( qrs, cacheJson, cacheHtml, function ( tpl ) {
            appResponse.status( 200 ).send( tpl );
        });

        return;
    }

    // JSON?
    if ( appRequest.query.format === "json" ) {
        if ( cacheJson ) {
            appResponse.status( 200 ).json( cacheJson );

        } else {
            sqsMiddleware.getJson( url, qrs, function ( error, json ) {
                if ( !error ) {
                    sqsCache.set( (cacheName + ".json"), json.json );

                    appResponse.status( 200 ).json( json.json );

                } else {
                    // Handle errors
                    sqsLogger.log( "error", ("Error requesting page json => " + error) );
                }
            });
        }

    // Request page?
    } else {
        sqsMiddleware.getJsonAndHtml( url, qrs, function ( error, data ) {
            if ( !error ) {
                if ( data.html.status === 404 || data.json.status === 404 ) {
                    appResponse.status( 200 ).send( fourOhFourHTML );

                    sqsLogger.log( "warn", ("Request responded with server code 404 for => `" + url + "`") );

                    return;
                }

                sqsCache.set( (cacheName + ".json"), data.json.json );
                sqsCache.set( (cacheName + ".html"), data.html.html );

                sqsTemplate.renderTemplate( qrs, data.json.json, sqsCache.get( (cacheName + ".html") ), function ( tpl ) {
                    appResponse.status( 200 ).send( tpl );
                });

            } else {
                // Handle errors
                sqsLogger.log( "error", ("Error requesting page => " + error) );
            }
        });
    }
},


/**
 *
 * @method getFolderRoot
 * @param {string} uri The express request uri
 * @returns {object}
 * @private
 *
 */
getFolderRoot = function ( uri ) {
    var ret = {
        folder: false,
        redirect: false
    };

    uri = uri.replace( rSlash, "" );

    for ( var i = serverConfig.siteData.siteLayout.layout.length; i--; ) {
        var layout = serverConfig.siteData.siteLayout.layout[ i ];

        // Break out if folder matched
        if ( ret.folder ) {
            break;
        }

        // Skip hidden navigations
        if ( layout.identifier === "_hidden" ) {
            continue;
        }

        for ( var j = layout.links.length; j--; ) {
            var link = layout.links[ j ];

            // Matched a root level folder uri request
            if ( link.typeName === "folders" && link.urlId === uri ) {
                ret.folder = true;
                ret.redirect = ("/" + link.children[ 0 ].urlId + "/");
                break;
            }
        }
    }

    return ret;
},


/**
 *
 * @method onExpressRouterGET
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
onExpressRouterGET = function ( appRequest, appResponse ) {
    var checkFolder,
        apiQuery;

    // Site CSS
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "site.css" ) {
        appResponse.set( "Content-Type", "text/css" ).status( 200 ).send( sqsTemplate.getSiteCss() );

        return;
    }

    // Exit clause...
    if ( rApi.test( appRequest.params[ 0 ] ) ) {
        apiQuery = appRequest.query;
        apiQuery.crumb = sqsMiddleware.getCrumb();

        sqsMiddleware.getJson( appRequest.params[ 0 ], apiQuery, function ( error, data ) {
            if ( !error ) {
                appResponse.set( "Content-Type", "application/json" ).status( data.status ).send( data.json );
            }
        });

        return;
    }

    // Favicon / Universal Image / clickthroughUrl
    if ( rIco.test( appRequest.params[ 0 ] ) || rUniversal.test( appRequest.params[ 0 ] ) || rClickthroughUrl.test( appRequest.params[ 0 ] ) ) {
        appResponse.redirect( (serverConfig.siteurl + appRequest.params[ 0 ]) );

        return;
    }

    // Config
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "config" ) {
        appResponse.redirect( (serverConfig.siteurl + "/config/") );

        return;
    }

    // Logout
    if ( appRequest.params[ 0 ].replace( rSlash, "" ) === "logout" ) {
        sqsUser = null;

        appResponse.redirect( "/" );

        return;
    }

    // Authentication
    if ( !sqsUser ) {
        appResponse.status( 200 ).send( loginHTML );

        return;
    }

    // Login expired
    if ( (Date.now() - sqsTimeOfLogin) >= sqsTimeLoggedIn ) {
        appResponse.redirect( "/logout/" );

        return;
    }

    // Top level folder
    checkFolder = getFolderRoot( appRequest.params[ 0 ] );

    if ( checkFolder.folder ) {
        appResponse.redirect( checkFolder.redirect );

        return;
    }

    // Run the template compiler
    sqsTemplate.refresh();

    // Render the response
    renderResponse( appRequest, appResponse );
},


/**
 *
 * @method onExpressRouterPOST
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
onExpressRouterPOST = function ( appRequest, appResponse ) {
    var data = {
            email: appRequest.body.email,
            password: appRequest.body.password
        };

    if ( !data.email || !data.password ) {
        appResponse.send( loginHTML );

        return;
    }

    // Keep user data in memory
    sqsUser = data;

    // Set middleware config
    sqsMiddleware.set( "useremail", data.email );
    sqsMiddleware.set( "userpassword", data.password );

    // Set user on external modules
    sqsTemplate.setUser( sqsUser );

    sqsLogger.log( "info", "Logging into Squarespace..." );

    // Login to site
    sqsMiddleware.doLogin(function ( error, headers ) {
        if ( !error ) {
            sqsLogger.log( "info", "...Logged in to Squarespace" );
            sqsLogger.log( "info", "Fetching data from Squarespace..." );

            // Fetch site API data
            sqsMiddleware.getAPIData( function ( error, data ) {
                if ( !error ) {
                    sqsLogger.log( "info", "...Fetched data from Squarespace" );

                    // Store the site data needed
                    serverConfig.siteData = data;

                    // Set config on external modules
                    sqsTemplate.setConfig( "server", serverConfig );

                    // Store time of login
                    sqsTimeOfLogin = Date.now();

                    // End login post
                    appResponse.json({
                        success: true
                    });

                } else {
                    // Handle errors
                    sqsLogger.log( "error", ("Error fetching data from Squarespace => " + error) );
                }
            });

        } else {
            // Handle errors
            sqsLogger.log( "error", ("Error logging into Squarespace => " + error) );

            // Reload login
            appResponse.redirect( "/" );
        }
    });
},


/**
 *
 * @method printUsage
 * @private
 *
 */
printUsage = function () {
    console.log( package.title );
    console.log( package.description );
    console.log( "Version " + package.version );
    console.log();
    console.log( "Commands:" );
    console.log( "sqs buster       Delete local site cache" );
    console.log( "sqs server       Start the local server" );
    console.log();
    console.log( "Options:" );
    console.log( "sqs --version    Print package version" );
    console.log( "sqs --forever    Start server using forever" );
    console.log( "sqs --fornever   Stop server started with forever" );
    console.log( "sqs --port=XXXX  Use the specified port" );
    console.log( "sqs --quiet      Silence the logger" );
    console.log();
    console.log( "Examples:" );
    console.log( "sqs server --port=8000" );
    process.exit();
},


/**
 *
 * @method printUsage
 * @private
 *
 */
printVersion = function () {
    sqsLogger.log( "info", (package.title + " version " + package.version) );
    process.exit();
},


/**
 *
 * @method processArguments
 * @param {object} args The arguments array
 * @private
 *
 */
processArguments = function ( args, cb ) {
    var flags = {},
        commands = {};

    if ( !args || !args.length ) {
        printUsage();
    }

    for ( var i = 0, len = args.length; i < len; i++ ) {
        var arg = args[ i ],
            rFlag = /^--/,
            split;

        if ( rFlag.test( arg ) ) {
            split = arg.split( "=" );
            flags[ split[ 0 ].replace( rFlag, "" ) ] = (split[ 1 ] || true);

        } else {
            commands[ arg ] = true;
        }
    }

    // Silence is golden
    if ( flags.quiet ) {
        sqsLogger.log( "server", "Squarespace server running in the dark" );
        sqsLogger.silence();
    }

    // Order of operations
    if ( flags.version ) {
        printVersion();

    } else if ( commands.buster ) {
        sqsCache.clear();
        process.exit();

    } else if ( commands.server ) {
        if ( flags.port ) {
            serverConfig.port = flags.port;
        }

        cb();
    }
},


/**
 *
 * @method startServer
 * @private
 *
 */
startServer = function () {
    // Create express application
    expressApp.use( express.static( serverConfig.webroot ) );
    expressApp.use( bodyParser.json() );
    expressApp.use( bodyParser.urlencoded( {extended: true} ) );
    expressApp.set( "port", serverConfig.port );
    expressApp.get( "*", onExpressRouterGET );
    expressApp.post( "/", onExpressRouterPOST );
    expressApp.listen( expressApp.get( "port" ) );

    // Log that the server is running
    sqsLogger.log( "server", ("Squarespace server running on port => " + expressApp.get( "port" )) );
};


/******************************************************************************
 * @Export
*******************************************************************************/
module.exports = {
    /**
     *
     * @method init
     * @param {object} conf The template.conf json
     * @param {object} args The command arguments
     * @public
     *
     */
    init: function ( conf, args ) {
        // Create global serverConfig
        setServerConfig( conf );

        // Create global templateConfig
        setTemplateConfig( conf );

        // Create global directories
        setDirectories();

        // Handle arguments
        // If Callback runs, start the server
        processArguments( args, function () {
            // Pass the logger to other modules
            sqsCache.setLogger( sqsLogger );
            sqsTemplate.setLogger( sqsLogger );

            // Prefetch the login page HTML
            sqsUtil.readFile( path.join( __dirname, "tpl/login.html" ), function ( data ) {
                loginHTML = sqsUtil.packStr( data );
            });

            // Prefetch the 404 page HTML
            sqsUtil.readFile( path.join( __dirname, "tpl/404.html" ), function ( data ) {
                fourOhFourHTML = sqsUtil.packStr( data );
            });

            // Preload the sqs-cache
            sqsCache.preload(function () {
                // Preload and process the template
                sqsTemplate.preload();
                sqsTemplate.compile(function () {
                    // Watch for template changes
                    sqsTemplate.watch();

                    startServer();
                });
            });

            // Watch for changes to template.conf and reload it
            fs.watchFile( templateConfigPath, function () {
                sqsUtil.readJson( templateConfigPath, function ( data ) {
                    setTemplateConfig( data );

                    sqsLogger.log( "template", "Reloaded template.conf json" );
                });
            });
        });
    },

    /**
     *
     * @method print
     * @public
     *
     */
    print: printUsage,

    /**
     *
     * @method printv
     * @public
     *
     */
    printv: printVersion
};
