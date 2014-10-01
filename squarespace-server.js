/*!
 *
 * Squarespace node server.
 *
 * @TODOS
 * @todo: squarespace:block-field
 * @todo: squarespace.main-content
 * @todo: squarespace.page-classes
 * @todo: squarespace.page-id
 * @todo: BadFormatters
 * @todo: BadPredicates
 * @todo: 404 pages
 * @todo: sqs server scripts
 * @todo: merge server config into template.conf
 *
 * @PERFS
 * ...
 *
 * @BREAKS
 * work.list - {.if categoryFilter}{categoryFilter}{.or}All{.end}
 * post-item.block - {.if categories}{.repeated section categories}{@}{.alternates with}{.end}{.end}
 *
 */
var _ = require( "underscore" ),
    express = require( "express" ),
    request = require( "request" ),
    path = require( "path" ),
    http = require( "http" ),
    fs = require( "fs" ),
    ncp = require( "ncp" ).ncp,
    slug = require( "slug" ),
    less = require( "less" ),
    jsonTemplate = require( "./lib/jsontemplate" ),
    functions = require( "./lib/functions" ),

    rQuote = /\'|\"/g,
    rSlash = /^\/|\/$/g,
    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rHeader = /header/,
    rFooter = /footer/,
    rAttrs = /(\w+)=("[^<>"]*"|'[^<>']*'|\w+)/g,
    rScripts = /\<script\>(.*?)\<\/script\>/g,
    rIco = /\.ico$/,
    rBlockIncs = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rTplFiles = /\.item$|\.list$|\.region$/,
    rItemOrList = /\.item$|\.list$/,
    rRegions = /\.region$/,
    rItem = /\.item$/,
    rList = /\.list$/,
    rLess = /\.less$/,

    // Squarespace content
    rSQSQuery = /(\<squarespace:query.*?\>)(.*?)(\<\/squarespace:query\>)/,
    rSQSNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rSQSBlockFields = /\<squarespace:block-field(.*?)\/\>/g,
    rSQSScripts = /\<squarespace:script(.*?)\/\>/g,
    rSQSClickThroughUrl = /\/s\/(.*?)\.\w+.*?/g,

    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = "{squarespace.page-id}",
    SQS_POST_ENTRY = "{squarespace-post-entry}",

    undefined_str = "",
    more_predicates = require( "./lib/predicates" ),
    more_formatters = require( "./lib/formatters" ),

    jsontOptions = {
        more_formatters: more_formatters,
        more_predicates: more_predicates,
        undefined_str: undefined_str
    },

    sqsHeaders = [
        '<link href="/styles/styles.css" rel="stylesheet" />',
        '<script src="http://static.squarespace.com/universal/scripts-compressed/common.js"></script>',
        '<script src="http://static.squarespace.com/universal/scripts-compressed/commerce.js"></script>'
    ],
    sqsFooters = [
        '<script src="/sqs/imageloader.js"></script>'
    ],

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36",
    },

    // Squarespace uses /homepage
    homepage = "homepage",

    server = {},
    directories = {},

    options = {
        port: 5050,
        gitroot: process.cwd(),
    },

    scripts = [],

    header = null,
    footer = null,

    app = express();


/**
 *
 * @method requestHtml
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestHtml( url, qrs, callback ) {
    request({
        url: url,
        headers: headers,
        qs: qrs

    }, function ( error, response, html ) {
        if ( error ) {
            functions.log( error );
            return;
        }

        callback( html );
    });
}


/**
 *
 * @method requestJson
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestJson( url, qrs, callback ) {
    var qs = {};
        qs.format = "json";

    for ( var i in qrs ) {
        qs[ i ] = qrs[ i ];
    }

    request({
        url: url,
        json: true,
        headers: headers,
        qs: qs

    }, function ( error, response, json ) {
        if ( error ) {
            functions.log( error );
            return;
        }

        callback( json );
    });
}


/**
 *
 * @method requestJsonAndHtml
 * @param {string} url Request url
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestJsonAndHtml( url, qrs, callback ) {
    var res = {};

    requestJson( url, qrs, function ( json ) {
        res.json = json;

        requestHtml( url, qrs, function ( html ) {
            res.html = html;

            callback( res );
        })
    });
}


/**
 *
 * @method requestQuery
 * @param {object} query Regex matched object
 * @param {object} qrs Querystring mapping
 * @param {function} callback Fired when done
 * @private
 *
 */
function requestQuery( query, qrs, callback ) {
    var data = functions.getAttrObj( query[ 1 ] ),
        url = ( options.siteurl + "/" + data.collection + "/" ),
        slg = ("query-" + data.collection),
        qs = {};
        qs.format = "json";

    for ( var i in qrs ) {
        qs[ i ] = qrs[ i ];
    }

    // Tag?
    if ( data.tag ) {
        qs.tag = data.tag;
        slg += "-" + data.tag;
    }

    // Category?
    if ( data.category ) {
        qs.category = data.category;
        slg += "-" + data.category;
    }

    slg = path.join( options.cacheroot, (slg + ".json") );

    // Cached?
    if ( fs.existsSync( slg ) ) {
        functions.log( "Loading query from cache" );

        callback( query, data, functions.readJson( slg ) );

    } else {
        request({
            url: url,
            json: true,
            headers: headers,
            qs: qs

        }, function ( error, response, json ) {
            functions.writeJson( slg, json );

            callback( query, data, json );
        });
    }
}


/**
 *
 * options = {
 *      siteurl,
 *      gitroot,
 *      webroot,
 *      cacheroot,
 *      styleroot
 *      port
 * };
 *
 * @method setOptions
 * @param {object} config The server.conf json
 * @returns {string}
 * @private
 *
 */
function setOptions( config ) {
    // @global - options
    options.siteurl = config.siteurl.replace( rSlash, "" );

    if ( config.password ) {
        options.password = config.password;
    }

    if ( !config.webroot ) {
        options.webroot = path.join( options.gitroot, ".server" );

        if ( !fs.existsSync( options.webroot ) ) {
            fs.mkdirSync( options.webroot );
        }
    }

    if ( !config.cacheroot ) {
        options.cacheroot = path.join( options.webroot, ".cache" );

        if ( !fs.existsSync( options.cacheroot ) ) {
            fs.mkdirSync( options.cacheroot );
        }
    }

    if ( !config.styleroot ) {
        options.styleroot = path.join( options.webroot, "styles" );

        if ( !fs.existsSync( options.styleroot ) ) {
            fs.mkdirSync( options.styleroot );
        }
    }

    if ( !config.sqsroot ) {
        options.sqsroot = path.join( options.webroot, "sqs" );

        if ( !fs.existsSync( options.sqsroot ) ) {
            fs.mkdirSync( options.sqsroot );
        }
    }
}


/**
 *
 * @method setDirectories
 * @returns {object}
 * @private
 *
 */
function setDirectories() {
    // @global - directories
    directories = {
        blocks: path.join( options.gitroot, "blocks" ),
        collections: path.join( options.gitroot, "collections" ),
        assets: path.join( options.gitroot, "assets" ),
        pages: path.join( options.gitroot, "pages" ),
        scripts: path.join( options.gitroot, "scripts" ),
        styles: path.join( options.gitroot, "styles" )
    };

    // @global - server
    server = {
        assets: path.join( options.webroot, "assets" ),
        scripts: path.join( options.webroot, "scripts" ),
        styles: path.join( options.webroot, "styles" ),
        sqs: path.join( options.webroot, "sqs" )
    };
}


/**
 *
 * @method copyDirectoriesToServer
 * @private
 *
 */
function copyDirectoriesToServer() {
    ncp( directories.assets, server.assets );
    ncp( directories.scripts, server.scripts );
    ncp( path.join( __dirname, "sqs" ), server.sqs );
}


/**
 *
 * @method getToken
 * @returns {string}
 * @private
 *
 */
function getToken() {
    return ("token-" + Date.now() + ("" + Math.floor( (Math.random() * 1000000) + 1 )));
}


/**
 *
 * @method setHeaderFooter
 * @param {function} callback Handle composition done
 * @private
 *
 */
function setHeaderFooter( callback ) {
    var files = fs.readdirSync( options.gitroot );

    for ( i = files.length; i--; ) {
        if ( rRegions.test( files[ i ] ) && rHeader.test( files[ i ] ) ) {
            header = path.join( options.gitroot, files[ i ] );

        } else if ( rRegions.test( files[ i ] ) && rFooter.test( files[ i ] ) ) {
            footer = path.join( options.gitroot, files[ i ] );
        }
    }

    return callback;
}


/**
 *
 * @method compileCollections
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compileCollections( callback ) {
    var collections = fs.readdirSync( directories.collections ),
        content = null,
        file = null,
        link = null,
        files = null;

    for ( var i = collections.length; i--; ) {
        if ( rItemOrList.test( collections[ i ] ) ) {
            content = "";
            file = path.join( directories.collections, collections[ i ] );
            link = path.join( options.webroot, collections[ i ] );
            files = [header, file, footer];

            for ( var j = 0, len = files.length; j < len; j++ ) {
                content += functions.readFile( files[ j ] );
            }

            functions.writeFile( link, content );
        }
    }

    return callback;
}


/**
 *
 * @method compileRegions
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compileRegions( callback ) {
    var templateConf = JSON.parse( functions.readFile( path.join( options.gitroot, "template.conf" ) ) ),
        files = null,
        file = null,
        link = null;

    for ( var i in templateConf.layouts ) {
        files = templateConf.layouts[ i ].regions;
        file = "";
        link = path.join( options.webroot, (templateConf.layouts[ i ].name.toLowerCase() + ".region") );

        for ( j = 0, len = files.length; j < len; j++ ) {
            file += functions.readFile( path.join( options.gitroot, (files[ j ] + ".region") ) );
        }

        functions.writeFile( link, file );
    }

    return callback;
}


/**
 *
 * @method replaceBlocks
 * @param {function} callback Handle composition done
 * @private
 *
 */
function replaceBlocks( callback ) {
    var files = fs.readdirSync( options.webroot ),
        filepath,
        fileguts,
        matched,
        block,
        filed;

    for ( var i = files.length; i--; ) {
        if ( !rTplFiles.test( files[ i ] ) ) {
            continue;
        }

        filepath = path.join( options.webroot, files[ i ] );

        fileguts = functions.readFile( filepath );

        while ( matched = fileguts.match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                filed = functions.readFile( path.join( directories.blocks, block ) );

                fileguts = fileguts.replace( matched[ j ], filed );
            }
        }

        functions.writeFile( filepath, fileguts );
    }

    return callback;
}


/**
 *
 * @method replaceScripts
 * @param {function} callback Handle composition done
 * @private
 *
 */
function replaceScripts( callback ) {
    var files = fs.readdirSync( options.webroot ),
        filepath,
        fileguts,
        matched,
        token;

    for ( var i = files.length; i--; ) {
        if ( !rTplFiles.test( files[ i ] ) ) {
            continue;
        }

        filepath = path.join( options.webroot, files[ i ] );

        fileguts = functions.readFile( filepath );

        matched = fileguts.match( rScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                token = getToken();
                scripts.push({
                    token: token,
                    script: matched[ j ]
                });

                fileguts = fileguts.replace( matched[ j ], token );
            }
        }

        functions.writeFile( filepath, fileguts );
    }

    return callback;
}


/**
 *
 * @method replaceSQSScripts
 * @param {function} callback Handle composition done
 * @private
 *
 */
function replaceSQSScripts( callback ) {
    var files = fs.readdirSync( options.webroot ),
        filepath,
        fileguts,
        matched,
        attrs,
        block,
        filed;

    for ( var i = files.length; i--; ) {
        if ( !rTplFiles.test( files[ i ] ) ) {
            continue;
        }

        filepath = path.join( options.webroot, files[ i ] );

        fileguts = functions.readFile( filepath );

        matched = fileguts.match( rSQSScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                attrs = functions.getAttrObj( matched[ j ] );
                block = ( "/scripts/" + attrs.src );
                filed = '<script src="' + block + '"></script>';

                fileguts = fileguts.replace( matched[ j ], filed );
            }
        }

        functions.writeFile( filepath, fileguts );
    }

    return callback;
}


/**
 *
 * @method compileStylesheets
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compileStylesheets( callback ) {
    var templateConf = JSON.parse( functions.readFile( path.join( options.gitroot, "template.conf" ) ) ),
        files = fs.readdirSync( options.webroot ),
        reset = path.join( directories.styles, "reset.css" ),
        styles = "",
        file,
        filepath,
        fileguts;

    if ( fs.existsSync( reset ) ) {
        styles += functions.readFile( reset );
    }

    for ( var i = 0, len = templateConf.stylesheets.length; i < len; i++ ) {
        file = "" + fs.readFileSync( path.join( directories.styles, templateConf.stylesheets[ i ] ) );

        if ( rLess.test( templateConf.stylesheets[ i ] ) ) {
            less.render( file, function ( e, css ) {
                styles += css;
            });

        } else {
            styles += file;
        }
    }

    functions.writeFile( path.join( options.styleroot, "styles.css" ), styles );

    for ( var j = files.length; j--; ) {
        if ( !rTplFiles.test( files[ j ] ) ) {
            continue;
        }

        filepath = path.join( options.webroot, files[ j ] );

        fileguts = functions.readFile( filepath );

        functions.writeFile( filepath, fileguts );
    }

    return callback;
}


/**
 *
 * @method getTemplate
 * @param {string} reqUri URI seg zero
 * @param {object} pageJson JSON data for page
 * @private
 *
 */
function getTemplate( reqUri, pageJson ) {
    var template = null,
        uriSegs = null,
        regcheck = null,
        tplFiles = fs.readdirSync( options.webroot );

    if ( reqUri === "/" ) {
        uriSegs = [homepage];

    } else {
        uriSegs = reqUri.replace( rSlash, "" ).split( "/" );
    }

    regcheck = new RegExp( ("^" + uriSegs[ 0 ] + ".*?\\."), "i" );

    for ( var i = tplFiles.length; i--; ) {
        if ( !rTplFiles.test( tplFiles[ i ] ) ) {
            continue;
        }

        // 0 => Multiple URIs some/fresh/page
        // 1 => Regular Expression tests out
        // 2 => Filename tests out as a .item file
        if ( uriSegs.length > 1 && regcheck.test( tplFiles[ i ] ) && rItem.test( tplFiles[ i ] ) ) {
            template = tplFiles[ i ];
            break;
        }

        // 0 => A Single URI page
        // 1 => Regular Expression tests out
        // 2 => Filename tests out as a .list file
        if ( uriSegs.length === 1 && regcheck.test( tplFiles[ i ] ) && rList.test( tplFiles[ i ] ) ) {
            template = tplFiles[ i ];
            break;
        }

        // 1 => Regular Expression tests out
        // 2 => Filename tests out as a .region file
        if ( regcheck.test( tplFiles[ i ] ) && rRegions.test( tplFiles[ i ] ) ) {
            template = tplFiles[ i ];
            break;
        }
    }

    // 0 => Template not matched above, try page JSON
    if ( !template ) {
        template = (pageJson.collection.regionName + ".region");
    }

    // 0 => Template still didn't match up, fail...
    if ( !template ) {
        functions.log( "Template not matched - " + template );

    } else {
        functions.log( "TEMPLATE - " + template );

        return template;
    }
}


/**
 *
 * @method replaceSQSTags
 * @param {string} rendered The template rendering
 * @param {object} pageJson JSON data for page
 * @returns {string}
 * @private
 *
 */
function replaceSQSTags( rendered, pageJson ) {
    //rendered = rendered.replace( SQS_HEADERS, "" );
    //rendered = rendered.replace( SQS_FOOTERS, "" );
    rendered = rendered.replace( SQS_MAIN_CONTENT, pageJson.mainContent );
    rendered = rendered.replace( SQS_PAGE_CLASSES, "" );
    rendered = rendered.replace( SQS_PAGE_ID, "" );
    rendered = rendered.replace( SQS_POST_ENTRY, "" );

    return rendered;
}


/**
 *
 * @method replaceNavigations
 * @param {string} rendered The template rendering
 * @param {string} pageHtml The HTML for the page
 * @returns {string}
 * @private
 *
 */
function replaceNavigations( rendered, pageHtml ) {
    var attrs,
        block,
        filed,
        open,
        close,
        regex,
        matched,
        match;

    // SQS Navigations
    matched = rendered.match( rSQSNavis );

    if ( matched ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            attrs = functions.getAttrObj( matched[ i ] );
            block = (attrs.template + ".block");
            filed = ("" + fs.readFileSync( path.join( directories.blocks, block ) )).split( "\n" );
            open = filed.shift();
            close = filed.pop();
            regex = new RegExp( open + "(.*?)" + close );
            match = pageHtml.match( regex );

            if ( match ) {
                rendered = rendered.replace( matched[ i ], match[ 0 ] );
            }
        }
    }

    return rendered;
}


/**
 *
 * @method replaceClickThroughUrls
 * @param {string} rendered The template rendering
 * @returns {string}
 * @private
 *
 */
function replaceClickThroughUrls( rendered ) {
    var matched = rendered.match( rSQSClickThroughUrl ),
        fullUrl;

    if ( matched ) {
        for ( i = 0, len = matched.length; i < len; i++ ) {
            fullUrl = (options.siteurl + matched[ i ]);

            rendered = rendered.replace( matched[ i ], fullUrl );
        }
    }

    return rendered;
}


/**
 *
 * @method renderTemplate
 * @param {string} reqUri URI seg zero
 * @param {object} qrs Querystring mapping
 * @param {object} pageJson JSON data for page
 * @param {string} pageHtml HTML for page
 * @param {function} clalback Fired when done
 * @private
 *
 */
function renderTemplate( reqUri, qrs, pageJson, pageHtml, callback ) {
    var queries = [],
        filepath = null,
        template = null,
        rendered = null,
        matched = null;

    // Template?
    template = getTemplate( reqUri, pageJson );

    // Filepath?
    filepath = path.join( options.webroot, template );

    // Html?
    rendered = functions.readFile( filepath );

    // SQS Tags?
    rendered = replaceSQSTags( rendered, pageJson );

    // Queries
    // 0 => Full
    // 1 => Open
    // 2 => Template
    // 3 => Close
    while ( matched = rendered.match( rSQSQuery ) ) {
        rendered = rendered.replace( matched[ 0 ], matched[ 2 ] );

        queries.push( matched );
    }

    function handleDone() {
        var tokenHeader = getToken(),
            tokenFooter = getToken(),
            tokenTypekit = getToken();

        // Typekit?
        if ( pageJson.website.typekitId ) {
            sqsHeaders.push( '<script src="//use.typekit.com/' + pageJson.website.typekitId + '.js"></script>' );
            sqsHeaders.push( tokenTypekit );

            scripts.push({
                token: tokenTypekit,
                script: '<script>try{Typekit.load();}catch(e){}</script>'
            });
        }

        // Headers?
        sqsHeaders.push( tokenHeader );
        scripts.push({
            token: tokenHeader,
            script: '<script>Static.SQUARESPACE_CONTEXT=' + JSON.stringify( pageJson ) + ';Squarespace.load(window);</script>'
        });

        // Footers?
        sqsFooters.push( tokenFooter );
        scripts.push({
            token: tokenFooter,
            script: '<script>Squarespace.afterBodyLoad(Y);</script>'
        });

        // Render {squarespace-headers} to the best of our ability
        rendered = rendered.replace( SQS_HEADERS, sqsHeaders.join( "" ) );

        // Render {squarespace-footers} to the best of our ability
        rendered = rendered.replace( SQS_FOOTERS, sqsFooters.join( "" ) );

        // Render Navigations from pageHtml
        rendered = replaceNavigations( rendered, pageHtml );

        // Render full clickThroughUrl's
        rendered = replaceClickThroughUrls( rendered );

        // Render w/jsontemplate
        rendered = jsonTemplate.Template( rendered, jsontOptions );
        rendered = rendered.expand( pageJson );

        // Add token scripts back into the template
        for ( var i = scripts.length; i--; ) {
            rendered = rendered.replace( scripts[ i ].token, scripts[ i ].script );
        }

        callback( rendered );
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

            rendered = rendered.replace( query[ 2 ], tpl );
        }

        if ( queries.length ) {
            requestQuery( queries.shift(), qrs, handleQueried );

        } else {
            functions.log( "Queries finished" );

            handleDone();
        }
    }

    if ( queries.length ) {
        handleQueried();

    } else {
        handleDone();
    }
}


/**
 *
 * @method compositionDone
 * @param {function} callback Handle composition done
 * @private
 *
 */
function compositionDone( callback ) {
    callback();
}


/**
 *
 * @method onCompositionDone
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
function onCompositionDone( appRequest, appResponse ) {
    var cacheHtml = null,
        cacheJson = null,
        slugged = slug( appRequest.params[ 0 ] ),
        reqSlug = ( slugged === "" ) ? homepage : slugged,
        url = (options.siteurl + appRequest.params[ 0 ]),
        qrs = {};

    cacheHtml = path.join( options.cacheroot, (reqSlug + ".html") );
    cacheJson = path.join( options.cacheroot, (reqSlug + ".json") );

    // JSON cache?
    if ( fs.existsSync( cacheJson ) ) {
        cacheJson = functions.readJson( path.join( options.cacheroot, (reqSlug + ".json") ) );

    } else {
        cacheJson = null;
    }

    // HTML cache?
    if ( fs.existsSync( cacheHtml ) ) {
        cacheHtml = functions.readFile( path.join( options.cacheroot, (reqSlug + ".html") ) );

    } else {
        cacheHtml = null;
    }

    // Password?
    if ( options.password ) {
        qrs.password = options.password;
    }

    // Querystring?
    for ( i in appRequest.query ) {
        qrs[ i ] = appRequest.query[ i ];
    }

    // Cache?
    if ( cacheJson && cacheHtml && appRequest.query.format !== "json" ) {
        functions.log( "Loading request from cache" );

        renderTemplate( appRequest.params[ 0 ], qrs, cacheJson, cacheHtml, function ( tpl ) {
            appResponse.status( 200 ).send( tpl );
        });

        return;
    }

    // JSON?
    if ( appRequest.query.format === "json" ) {
        if ( cacheJson ) {
            functions.log( "Loading json from cache" );

            appResponse.status( 200 ).json( cacheJson );

        } else {
            requestJson( url, qrs, function ( json ) {
                functions.writeJson( path.join( options.cacheroot, (reqSlug + ".json") ), json );

                appResponse.status( 200 ).json( json );
            });
        }

    // Request page?
    } else {
        requestJsonAndHtml( url, qrs, function ( data ) {
            functions.writeJson( path.join( options.cacheroot, (reqSlug + ".json") ), data.json );
            functions.writeFile( path.join( options.cacheroot, (reqSlug + ".html") ), functions.squashHtml( data.html ) );

            renderTemplate( appRequest.params[ 0 ], qrs, data.json, functions.squashHtml( data.html ), function ( tpl ) {
                appResponse.status( 200 ).send( tpl )
            });
        });
    }
}


/**
 *
 * @method onExpressRouterGET
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
function onExpressRouterGET( appRequest, appResponse ) {
    var compose = _.compose(
            compositionDone,
            compileStylesheets,
            replaceSQSScripts,
            replaceScripts,
            replaceBlocks,
            compileRegions,
            compileCollections,
            setHeaderFooter
        );

    // Exit clause...
    if ( rIco.test( appRequest.params[ 0 ] ) ) {
        return;

    } else {
        functions.log( "GET - " + appRequest.params[ 0 ] );
    }

    // Compose public server
    compose(function () {
        onCompositionDone( appRequest, appResponse );
    });
}


/**
 *
 * @export
 * @public
 * -------
 * @method init
 * @param {object} config The server.conf json
 *
 */
module.exports = {
    init: function ( config ) {
        // Create global options
        setOptions( config );

        // Create global directories
        setDirectories();

        // Copy directories to .server
        copyDirectoriesToServer();

        // Create express application
        app.use( express.static( options.webroot ) );
        app.set( "port", options.port );
        app.get( "*", onExpressRouterGET );

        // Create server instance
        http.Server( app ).listen( app.get( "port" ) );

        // Log that server is running
        functions.log( ("Running @http://localhost:" + app.get( "port" )) );
    }
};