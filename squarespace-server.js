/*!
 *
 * Squarespace node server.
 *
 * @todo: squarespace:query
 * @todo: squarespace:block
 * @todo: squarespace:navigation
 * @todo: squarespace-headers
 * @todo: squarespace-footers
 * @todo: squarespace.main-content
 * @todo: squarespace.page-classes
 * @todo: squarespace.page-id
 * @todo: <script></script>
 * @todo: BadFormatters
 * @todo: BadPredicates
 *
 * @BREAKS
 * work.list - {.if categoryFilter}{categoryFilter}{.or}All{.end}
 * post-item.block - {.if categories}{.repeated section categories}{@}{.alternates with}{.end}{.end}
 *
 */
var express = require( "express" ),
    request = require( "request" ),
    app = express(),
    path = require( "path" ),
    http = require( "http" ),
    https = require( "https" ),
    httpProxy = require( "http-proxy" ),
    tunnel = require( "tunnel" ),
    fs = require( "fs" ),
    ncp = require( "ncp" ).ncp,
    jsonTemplate = require( "./lib/jsontemplate" ),
    matchRoute = require( "./lib/matchroute" ),
    functions = require( "./lib/functions" ),

    rQuote = /\'|\"/g,
    rSlash = /\/$/g,
    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rHeader = /header/,
    rFooter = /footer/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rScripts = /\<script\>(.*?)\<\/script\>/g,

    rBlockIncs = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rRegions = /\.region$/,
    rItemOrList = /\.item$|\.list$/,

    // Squarespace content
    rSQSQuery = /(\<squarespace:query.*?\>)(.*?)(\<\/squarespace:query\>)/,
    rSQSNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rSQSBlockFields = /\<squarespace:block(.*?)\/\>/g,
    rSQSScripts = /\<squarespace:script(.*?)\/\>/g,
    rSQSClickThroughUrl = /\/s\/(.*?)\.\w+.*?/g,

    // collectionId=hash
    API_COLLECTION = "api/commondata/GetCollection",
    API_COLLECTIONS = "api/commondata/GetCollections",
    API_SITE_LAYOUT = "api/commondata/GetSiteLayout",
    API_TEMPLATE = "api/commondata/GetTemplate",

    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = "{squarespace.page-id}",
    SQS_POST_ENTRY = "{squarespace-post-entry}",

    sqsUrlQueries = [
        "format",
        "category",
        "tag",
        "month"
    ],

    undefined_str = "",
    more_predicates = require( "./lib/predicates" ),
    more_formatters = require( "./lib/formatters" ),

    jsontOptions = {
        more_formatters: more_formatters,
        more_predicates: more_predicates,
        undefined_str: undefined_str
    },

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36",
    },

    server = {},

    cache = {},

    scripts = [];


function getToken() {
    return ("token-" + Date.now() + ("" + Math.floor( (Math.random() * 1000000) + 1 )));
}


function preprocessTemplates( options ) {
    var templateConf = JSON.parse( functions.readFile( path.join( options.gitroot, "template.conf" ) ) ),
        blockDir = path.join( options.gitroot, "blocks" ),
        collectionDir = path.join( options.gitroot, "collections" ),
        assetDir = path.join( options.gitroot, "assets" ),
        pageDir = path.join( options.gitroot, "pages" ),
        scriptDir = path.join( options.gitroot, "scripts" ),
        styleDir = path.join( options.gitroot, "styles" ),
        collections = fs.readdirSync( collectionDir ),
        allFiles = fs.readdirSync( options.gitroot ),
        regions = [],
        header,
        footer,
        filepath,
        template,
        matched,
        filed,
        block,
        attrs,
        len,
        i,
        j;

    // Header/Footer Templates
    for ( i = allFiles.length; i--; ) {
        if ( rRegions.test( allFiles[ i ] ) && rHeader.test( allFiles[ i ] ) ) {
            header = path.join( options.gitroot, allFiles[ i ] );

        } else if ( rRegions.test( allFiles[ i ] ) && rFooter.test( allFiles[ i ] ) ) {
            footer = path.join( options.gitroot, allFiles[ i ] );
        }
    }

    // Collection Templates
    for ( i = collections.length; i--; ) {
        if ( rItemOrList.test( collections[ i ] ) ) {
            var cont = "";
            var file = path.join( collectionDir, collections[ i ] );
            var link = path.join( options.webroot, collections[ i ] );
            var files = [header, file, footer];

            for ( j = 0, len = files.length; j < len; j++ ) {
                cont += functions.readFile( files[ j ] );
            }

            functions.writeFile( link, cont );
        }
    }

    // Region Templates
    for ( i in templateConf.layouts ) {
        var files = templateConf.layouts[ i ].regions;
        var file = "";
        var link = path.join( options.webroot, (templateConf.layouts[ i ].name.toLowerCase() + ".region") );

        for ( j = 0, len = files.length; j < len; j++ ) {
            file += functions.readFile( path.join( options.gitroot, (files[ j ] + ".region") ) );
        }

        functions.writeFile( link, file );
    }

    for ( var r in options.routes ) {
        // File Path
        filepath = path.join( options.webroot, options.routes[ r ] );

        // Template
        template = functions.readFile( filepath );

        // SQS Blocks
        template = recursiveBlockReplace( blockDir, template );

        // Plain Scripts, will be added back after all parsing
        matched = template.match( rScripts );

        for ( i = 0, len = matched.length; i < len; i++ ) {
            token = getToken();
            scripts.push({
                token: token,
                script: matched[ i ]
            });

            template = template.replace( matched[ i ], token );
        }

        // SQS Scripts
        matched = template.match( rSQSScripts );

        for ( i = 0, len = matched.length; i < len; i++ ) {
            attrs = functions.getAttrObj( matched[ i ] );
            block = ( "/scripts/" + attrs.src );
            filed = '<script src="' + block + '"></script>';

            template = template.replace( matched[ i ], filed );
        }

        // Squarespace Tags
        template = template.replace( SQS_HEADERS, "" );
        template = template.replace( SQS_FOOTERS, "" );
        template = template.replace( SQS_MAIN_CONTENT, "" );
        template = template.replace( SQS_PAGE_CLASSES, "" );
        template = template.replace( SQS_PAGE_ID, "" );
        template = template.replace( SQS_POST_ENTRY, "" );

        functions.writeFile( filepath, template );
    }

    // Copy assets + scripts to .server
    ncp( assetDir, path.join( options.webroot, "assets" ) );
    ncp( scriptDir, path.join( options.webroot, "scripts" ) );
}


function recursiveBlockReplace( blockDir, template ) {
    var matched,
        block,
        filed;

    while ( matched = template.match( rBlockIncs ) ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            block = matched[ i ].replace( rBlockTags, "" );
            filed = functions.readFile( path.join( blockDir, block ) );

            template = template.replace( matched[ i ], filed );
        }
    }

    return template;
}


function requestJsonAndHtml( options, url, callback ) {
    var urls = [url, url],
        res = {};

    function makeRequest() {
        var qrs = {},
            json = (urls.length === 2) ? true : false;

        if ( options.password ) {
            qrs.password = options.password;
        }

        if ( json ) {
            qrs.format = "json";
        }

        request({
            url: urls.pop(),
            json: json,
            headers: headers,
            qs: qrs

        }, function ( error, response, data ) {
            if ( error ) {
                functions.clog( error );
                return;
            }

            if ( json ) {
                res.json = data;

            } else {
                res.html = functions.squashHtml( data );
            }

            if ( urls.length ) {
                makeRequest();

            } else {
                callback( res );
            }
        });
    }

    makeRequest();
}


function requestQuery( options, query, callback ) {
    var data = functions.getAttrObj( query[ 1 ] ),
        qrs = {
            format: "json"
        };

    if ( options.password ) {
        qrs.password = options.password;
    }

    if ( data.tag ) {
        qrs.tag = data.tag;
    }

    if ( data.category ) {
        qrs.category = data.category;
    }

    request({
        url: ( options.siteurl + "/" + data.collection + "/" ),
        json: true,
        headers: headers,
        qs: qrs

    }, function ( error, response, body ) {
        callback( query, data, body );
    });
}


function injectNavigations( options, pageHtml, template ) {
    var blockDir = path.join( options.gitroot, "blocks" ),
        attrs,
        block,
        filed,
        open,
        close,
        regex,
        matched;

    // SQS Navigations
    matched = template.match( rSQSNavis );

    for ( i = 0, len = matched.length; i < len; i++ ) {
        attrs = functions.getAttrObj( matched[ i ] );
        block = (attrs.template + ".block");
        filed = ("" + fs.readFileSync( path.join( blockDir, block ) )).split( "\n" );
        open = filed.shift();
        close = filed.pop();
        regex = new RegExp( open + "(.*?)" + close );

        template = template.replace( matched[ i ], pageHtml.match( regex )[ 0 ] );
    }

    return template;
}


function appendClickThroughUrls( options, template ) {
    var matched = template.match( rSQSClickThroughUrl ),
        fullUrl;

    if ( !matched ) {
        return template;
    }

    for ( i = 0, len = matched.length; i < len; i++ ) {
        fullUrl = (options.siteurl + matched[ i ]);

        template = template.replace( matched[ i ], fullUrl );
    }

    return template;
}


function compileTemplate( options, reqUri, pageJson, pageHtml, callback ) {
    var queries = [],
        filepath = null,
        template = null,
        matched = null,
        qrs = {
            format: "json"
        };

    for ( var r in options.routes ) {
        matched = matchRoute.compare( r, reqUri );

        if ( matched.matched ) {
            // File Path
            filepath = path.join( options.webroot, options.routes[ r ] );

            functions.clog( "TEMPLATE - " + options.routes[ r ] );

            // Template
            template = functions.readFile( filepath );

            // Queries
            // 0 => Full
            // 1 => Open
            // 2 => Template
            // 3 => Close
            while ( matched = template.match( rSQSQuery ) ) {
                template = template.replace( matched[ 0 ], matched[ 2 ] );

                queries.push( matched );
            }

            function handleDone() {
                // Render Navigations from pageHtml
                template = injectNavigations( options, pageHtml, template );

                // Render full clickThroughUrl's
                template = appendClickThroughUrls( options, template );

                // Render w/jsontemplate
                template = jsonTemplate.Template( template, jsontOptions );
                template = template.expand( pageJson );

                // Add token scripts back
                for ( var i = scripts.length; i--; ) {
                    template = template.replace( scripts[ i ].token, scripts[ i ].script );
                }

                callback( template );
            }

            function handleQueried( query, data, json ) {
                var items = [],
                    tpl;

                if ( query && data && json ) {
                    if ( data.featured ) {
                        for ( i = 0, len = json.items.length; i < len; i++ ) {
                            if ( json.items[ i ].starred ) {
                                items.push( json.items[ i ] );
                            }
                        }

                        json.items = items;
                    }

                    if ( data.limit ) {
                        json.items.splice( 0, (json.items.length - data.limit) );
                    }

                    tpl = jsonTemplate.Template( query[ 2 ], jsontOptions );
                    tpl = tpl.expand( json );

                    template = template.replace( query[ 2 ], tpl );
                }

                if ( queries.length ) {
                    requestQuery( options, queries.shift(), handleQueried );

                } else {
                    functions.clog( "Queries finished" );

                    handleDone();
                }
            }

            if ( queries.length ) {
                handleQueried();

            } else {
                handleDone();
            }
        }
    }
}


/**
 *
 * siteurl: string
 * password: string
 * port: number,
 * routes: object
 * ---
 * gitroot: cwd
 * webroot: .server
 *
 */
server.init = function ( options ) {
    if ( !options ) {
        throw new Error( "You need options, son!" );
    }

    // Options
    options.siteurl = options.siteurl.replace( rSlash, "" );

    if ( !options.port ) {
        options.port = 5050;
    }

    if ( !options.gitroot ) {
        options.gitroot = process.cwd();
    }

    if ( !options.webroot ) {
        options.webroot = path.join( options.gitroot, ".server" );

        if ( !fs.existsSync( options.webroot ) ) {
            fs.mkdirSync( options.webroot );
            fs.mkdirSync( path.join( options.webroot, ".cache" ) );
        }
    }

    // Bind Express routing
    app.use( express.static( options.webroot ) );
    app.set( "port", options.port );
    app.get( "*", function ( appRequest, appResponse ) {
        var cached = cache[ appRequest.params[ 0 ] ],
            qrs = {
                format: "json"
            };

        functions.clog( "GET - " + appRequest.params[ 0 ] );

        // Preprocess templates here to capture local template edits
        preprocessTemplates( options );

        // Password
        if ( options.password ) {
            qrs.password = options.password;
        }

        // Merge query
        for ( i in appRequest.query ) {
            qrs[ i ] = appRequest.query[ i ];
        }

        // Check the cache
        if ( cached ) {
            compileTemplate( options, appRequest.params[ 0 ], cached.json, cached.html, function ( tpl ) {
                appResponse.status( 200 ).send( tpl );
            });

            functions.clog( "Loading request from cache" );

            return;
        }

        // Get JSON and HMTL for the page requested, we need it :-(
        requestJsonAndHtml( options, (options.siteurl + appRequest.params[ 0 ]), function ( data ) {
            // Honor ?format=json, send response as json
            if ( appRequest.query.format === "json" ) {
                appResponse.status( 200 ).json( data.json );

            // Compile the effing template :-(
            } else {
                cache[ appRequest.params[ 0 ] ] = data;

                compileTemplate( options, appRequest.params[ 0 ], data.json, data.html, function ( tpl ) {
                    appResponse.status( 200 ).send( tpl )
                });
            }
        });
    });

    http.Server( app ).listen( app.get( "port" ) );

    functions.clog( "Running on port " + app.get( "port" ) );
};

module.exports = server;