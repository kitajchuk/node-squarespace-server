/*!
 *
 * Squarespace node server.
 *
 * @TODOS
 * - squarespace:block-field
 * - squarespace.page-classes
 * - squarespace.page-id
 * - JSON Template Scope Creep/Errors
 * - 404 Requests
 * - Cache conventions
 *      - query-*.json
 *      - page-*.json
 *      - page-*.html
 *      - api-*.json
 *      - secureauth.json
 *
 */
var _ = require( "underscore" ),
    bodyParser = require( "body-parser" ),
    cookieParser = require( "cookie" ),
    express = require( "express" ),
    request = require( "request" ),
    path = require( "path" ),
    http = require( "http" ),
    fs = require( "fs" ),
    fse = require( "fs-extra" ),
    slug = require( "slug" ),
    less = require( "less" ),
    uglifycss = require( "uglifycss" ),
    jsonTemplate = require( "./lib/jsontemplate" ),
    functions = require( "./lib/functions" ),

    rProtocol = /^https:|^http:/g,
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
    rApi = /^\/api/,

    // Squarespace content
    rSQSQuery = /(\<squarespace:query.*?\>)(.*?)(\<\/squarespace:query\>)/,
    rSQSNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rSQSBlockFields = /\<squarespace:block-field(.*?)\/\>/g,
    rSQSScripts = /\<squarespace:script(.*?)\/\>/g,
    rSQSClickThroughUrl = /\/s\/(.*?)\.\w+.*?/g,
    rSQSFootersFull = /\<script type="text\/javascript" data-sqs-type="imageloader"\>(.*)\<\/script\>/,
    rSQSHeadersFull = null,
    rSiteCssReplace = /\<link rel="stylesheet" type="text\/css" href="(.*?)site\.css\?(.*?)\>/g,
    rHref = /href="(.*?)"/,

    SQS_HEADERS = "{squarespace-headers}",
    SQS_FOOTERS = "{squarespace-footers}",
    SQS_MAIN_CONTENT = "{squarespace.main-content}",
    SQS_PAGE_CLASSES = "{squarespace.page-classes}",
    SQS_PAGE_ID = "{squarespace.page-id}",
    SQS_POST_ENTRY = "{squarespace-post-entry}",

    API_GET_SITELAYOUT = "/api/commondata/GetSiteLayout/",
    API_GET_COLLECTION = "/api/commondata/GetCollection/", //?collectionId
    API_GET_COLLECTIONS = "/api/commondata/GetCollections/",
    API_GET_TEMPLATE = "/api/template/GetTemplate/", // ?templateId
    API_GET_BLOCKFIELDS = "/api/block-fields/",
    API_GET_WIDGETRENDERING = "/api/widget/GetWidgetRendering/",
    API_AUTH_LOGIN = "/api/auth/Login/",

    undefined_str = "",
    more_predicates = require( "./lib/predicates" ),
    more_formatters = require( "./lib/formatters" ),

    jsontOptions = {
        more_formatters: more_formatters,
        more_predicates: more_predicates,
        undefined_str: undefined_str
    },

    sqsHeaders = [],
    sqsFooters = [],

    // Squarespace uses /homepage
    homepage = "homepage",

    directories = {},

    config = null,

    scripts = [],

    siteCss = null,

    header = null,
    footer = null,

    templates = {},

    app = express();


/**
 *
 * @method lookupCollection
 * @param {string} id The collection ID
 * @returns {object}
 * @private
 *
 */
function lookupCollection( id ) {
    var collection = null;

    for ( var i in config.server.siteData.collections.collections ) {
        if ( i === id ) {
            collection = config.server.siteData.collections.collections[ id ];
            break;
        }
    }

    return collection;
}


/**
 *
 * @method getHeaders
 * @param {object} headers Merge object with required headers
 * @returns {object}
 * @private
 *
 */
function getHeaders( headers ) {
    var ret = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36"
    };

    if ( headers ) {
        ret = _.extend( ret, headers );
    }

    return ret;
}


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
        headers: getHeaders(),
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
        headers: getHeaders(),
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
        url = ( config.server.siteurl + "/" + data.collection + "/" ),
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

    slg = path.join( config.server.cacheroot, (slg + ".json") );

    // Cached?
    if ( fs.existsSync( slg ) && qrs.nocache === undefined ) {
        functions.log( "Loading query from cache" );

        callback( query, data, functions.readJson( slg ) );

    } else {
        if ( qrs.nocache !== undefined ) {
            functions.log( "Clearing query cache" );
        }

        request({
            url: url,
            json: true,
            headers: getHeaders(),
            qs: qs

        }, function ( error, response, json ) {
            functions.writeJson( slg, json );

            callback( query, data, json );
        });
    }
}


/**
 *
 * config.server = {
 *      siteurl,
 *      webroot,
 *      cacheroot,
 *      port,
 *      password
 *      secureauth,
 *      siteData
 * };
 *
 * @method setServerConfig
 * @private
 *
 */
function setServerConfig() {
    var authFile;

    // @global - config
    config.server.siteurl = config.server.siteurl.replace( rSlash, "" );
    config.server.port = (config.server.port || 5050);
    config.server.webroot = process.cwd();
    config.server.protocol = config.server.siteurl.match( rProtocol )[ 0 ];

    if ( !config.server.cacheroot ) {
        config.server.cacheroot = path.join( config.server.webroot, ".sqs-cache" );

        if ( !fs.existsSync( config.server.cacheroot ) ) {
            fs.mkdirSync( config.server.cacheroot );
        }
    }

    authFile = path.join( config.server.cacheroot, "secureauth.json" );

    if ( !config.server.secureauth ) {
        config.server.siteData = {};

        if ( fs.existsSync( authFile ) ) {
            config.server.secureauth = functions.readFile( authFile );
        }

    } else {
        config.server.siteData = {
            collections: functions.readJson( path.join( config.server.cacheroot, "api-commondata-GetCollections.json" ) ),
            siteLayout: functions.readJson( path.join( config.server.cacheroot, "api-commondata-GetSiteLayout.json" ) )
        };
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
        blocks: path.join( config.server.webroot, "blocks" ),
        collections: path.join( config.server.webroot, "collections" ),
        assets: path.join( config.server.webroot, "assets" ),
        pages: path.join( config.server.webroot, "pages" ),
        scripts: path.join( config.server.webroot, "scripts" ),
        styles: path.join( config.server.webroot, "styles" )
    };
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
 * @method setSQSHeadersFooters
 * @param {function} callback Handle composition done
 * @private
 *
 */
function setSQSHeadersFooters( callback ) {
    sqsHeaders = [];
    sqsFooters = [];

    return callback;
}


/**
 *
 * @method setHeaderFooter
 * @param {function} callback Handle composition done
 * @private
 *
 */
function setHeaderFooter( callback ) {
    var files = fs.readdirSync( config.server.webroot );

    for ( i = files.length; i--; ) {
        if ( rRegions.test( files[ i ] ) && rHeader.test( files[ i ] ) ) {
            header = path.join( config.server.webroot, files[ i ] );

        } else if ( rRegions.test( files[ i ] ) && rFooter.test( files[ i ] ) ) {
            footer = path.join( config.server.webroot, files[ i ] );
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
        files = null;

    for ( var i = collections.length; i--; ) {
        if ( rItemOrList.test( collections[ i ] ) ) {
            content = "";
            file = path.join( directories.collections, collections[ i ] );
            files = [header, file, footer];

            for ( var j = 0, len = files.length; j < len; j++ ) {
                content += functions.readFile( files[ j ] );
            }

            templates[ collections[ i ] ] = content;
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
    var files = null,
        file = null,
        link = null;

    for ( var i in config.layouts ) {
        files = config.layouts[ i ].regions;
        file = "";
        link = (config.layouts[ i ].name.toLowerCase() + ".region");

        for ( j = 0, len = files.length; j < len; j++ ) {
            file += functions.readFile( path.join( config.server.webroot, (files[ j ] + ".region") ) );
        }

        templates[ link ] = file;
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
    var matched,
        block,
        filed;

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        while ( matched = templates[ i ].match( rBlockIncs ) ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                block = matched[ j ].replace( rBlockTags, "" );
                filed = functions.readFile( path.join( directories.blocks, block ) );

                templates[ i ] = templates[ i ].replace( matched[ j ], filed );
            }
        }
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
    var matched,
        token;

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        matched = templates[ i ].match( rScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                token = getToken();
                scripts.push({
                    token: token,
                    script: matched[ j ]
                });

                templates[ i ] = templates[ i ].replace( matched[ j ], token );
            }
        }
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
    var matched,
        attrs,
        block,
        filed;

    for ( var i in templates ) {
        if ( !rTplFiles.test( i ) ) {
            continue;
        }

        matched = templates[ i ].match( rSQSScripts );

        if ( matched ) {
            for ( var j = 0, len = matched.length; j < len; j++ ) {
                attrs = functions.getAttrObj( matched[ j ] );
                block = ( "/scripts/" + attrs.src );
                filed = '<script src="' + block + '"></script>';

                templates[ i ] = templates[ i ].replace( matched[ j ], filed );
            }
        }
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
    var reset = path.join( directories.styles, "reset.css" ),
        styles = "",
        file;

    if ( fs.existsSync( reset ) ) {
        styles += functions.readFile( reset );
    }

    for ( var i = 0, len = config.stylesheets.length; i < len; i++ ) {
        file = "" + fs.readFileSync( path.join( directories.styles, config.stylesheets[ i ] ) );

        if ( rLess.test( config.stylesheets[ i ] ) ) {
            less.render( file, function ( e, css ) {
                styles += css;
            });

        } else {
            styles += file;
        }
    }

    siteCss = uglifycss.processString( styles );

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
        regcheck = null;

    if ( reqUri === "/" ) {
        uriSegs = [homepage];

    } else {
        uriSegs = reqUri.replace( rSlash, "" ).split( "/" );
    }

    regcheck = new RegExp( ("^" + uriSegs[ 0 ] + ".*?\\."), "i" );

    for ( var tpl in templates ) {
        if ( !rTplFiles.test( tpl ) ) {
            continue;
        }

        // 0 => Multiple URIs some/fresh/page
        // 1 => Regular Expression tests out
        // 2 => Filename tests out as a .item file
        if ( uriSegs.length > 1 && regcheck.test( tpl ) && rItem.test( tpl ) ) {
            template = tpl;
            break;
        }

        // 0 => A Single URI page
        // 1 => Regular Expression tests out
        // 2 => Filename tests out as a .list file
        if ( uriSegs.length === 1 && regcheck.test( tpl ) && rList.test( tpl ) ) {
            template = tpl;
            break;
        }

        // 1 => Regular Expression tests out
        // 2 => Filename tests out as a .region file
        if ( regcheck.test( tpl ) && rRegions.test( tpl ) ) {
            template = tpl;
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
 * @param {string} pageJson The JSON for the page
 * @returns {string}
 * @private
 *
 */
function replaceNavigations( rendered, pageJson ) {
    var context = {
            active: false,
            folderActive: false,
            website: pageJson.website,
            items: []
        },
        block,
        items,
        attrs,
        matched,
        template,
        i,
        iLen,
        j,
        k,
        kLen;

    // SQS Navigations
    matched = rendered.match( rSQSNavis );

    if ( matched ) {
        for ( i = 0, iLen = matched.length; i < iLen; i++ ) {
            attrs = functions.getAttrObj( matched[ i ] );
            block = (attrs.template + ".block");
            template = functions.readFile( path.join( directories.blocks, block ) );

            for ( j = config.server.siteData.siteLayout.layout.length; j--; ) {
                if ( config.server.siteData.siteLayout.layout[ j ].identifier === attrs.navigationId ) {
                    items = [];

                    for ( var k = 0, kLen = config.server.siteData.siteLayout.layout[ j ].links.length; k < kLen; k++ ) {
                        items.push({
                            active: false,
                            folderActive: false,
                            collection: lookupCollection( config.server.siteData.siteLayout.layout[ j ].links[ k ].collectionId )
                        });
                    }

                    context.items = items;
                }
            }

            template = jsonTemplate.Template( template, jsontOptions );
            template = template.expand( context );

            rendered = rendered.replace( matched[ i ], template );
        }
    }

    return rendered;
}


/**
 *
 * @method replaceBlockFields
 * @param {string} rendered The template rendering
 * @returns {string}
 * @private
 *
 */
function replaceBlockFields( rendered ) {
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
            fullUrl = (config.server.siteurl + matched[ i ]);

            rendered = rendered.replace( matched[ i ], fullUrl );
        }
    }

    return rendered;
}


/**
 *
 * @method setHeaderFooterTokens
 * @param {object} pageJson JSON data for page
 * @param {string} pageHtml HTML for page
 * @returns {string}
 * @private
 *
 */
function setHeaderFooterTokens( pageJson, pageHtml ) {
    var tokenTypekit = getToken(),
        tokenHeadersFull = getToken(),
        tokenFootersFull = getToken(),
        sHeadersFull = pageHtml.match( rSQSHeadersFull ),
        sFootersFull = pageHtml.match( rSQSFootersFull ),
        siteStyleTag = null,
        sSiteCssMatch;

    // Typekit?
    if ( pageJson.website.typekitId ) {
        sqsHeaders.push( '<script src="//use.typekit.com/' + pageJson.website.typekitId + '.js"></script>' );
        sqsHeaders.push( tokenTypekit );

        scripts.push({
            token: tokenTypekit,
            script: '<script>try{Typekit.load();}catch(e){}</script>'
        });
    }

    // Footers?
    if ( sFootersFull ) {
        sqsFooters.push( tokenFootersFull );
        scripts.push({
            token: tokenFootersFull,
            script: sFootersFull[ 0 ]
        });
    }

    // Headers?
    if ( sHeadersFull ) {
        sHeadersFull = sHeadersFull[ 0 ];
        //sSiteCssMatch = sHeadersFull[ 0 ].match( rSiteCssReplace );
        siteStyleTag = '<!-- ' + config.name + ' Local Styles --><style type="text/css">' + siteCss + '</style>';
        //sHeadersFull = sHeadersFull[ 0 ].replace( sSiteCssMatch[ sSiteCssMatch.length - 1 ], "<!-- Site.css Removed -->" );
        sHeadersFull += siteStyleTag;
        sqsHeaders.push( tokenHeadersFull );
        scripts.push({
            token: tokenHeadersFull,
            script: sHeadersFull
        });
    }
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
        template = null,
        rendered = null,
        matched = null;

    // Template?
    template = getTemplate( reqUri, pageJson );

    // Html?
    rendered = templates[ template ];

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
        // Create {squarespace-headers} / {squarespace-footers}
        setHeaderFooterTokens( pageJson, pageHtml )

        // Render {squarespace-headers} to the best of our ability
        rendered = rendered.replace( SQS_HEADERS, sqsHeaders.join( "" ) );

        // Render {squarespace-footers} to the best of our ability
        rendered = rendered.replace( SQS_FOOTERS, sqsFooters.join( "" ) );

        // Render Navigations from pageHtml
        rendered = replaceNavigations( rendered, pageJson );

        // Render Block Fields
        rendered = replaceBlockFields( rendered );

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
        url = (config.server.siteurl + appRequest.params[ 0 ]),
        qrs = {};

    cacheHtml = path.join( config.server.cacheroot, (reqSlug + ".html") );
    cacheJson = path.join( config.server.cacheroot, (reqSlug + ".json") );

    // JSON cache?
    if ( fs.existsSync( cacheJson ) ) {
        cacheJson = functions.readJson( path.join( config.server.cacheroot, (reqSlug + ".json") ) );

    } else {
        cacheJson = null;
    }

    // HTML cache?
    if ( fs.existsSync( cacheHtml ) ) {
        cacheHtml = functions.readFile( path.join( config.server.cacheroot, (reqSlug + ".html") ) );

    } else {
        cacheHtml = null;
    }

    // Nocache?
    if (  appRequest.query.nocache !== undefined ) {
        cacheJson = null;
        cacheHtml = null;

        functions.log( "Clearing request cache" );
    }

    // Password?
    if ( config.server.password ) {
        qrs.password = config.server.password;
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
                functions.writeJson( path.join( config.server.cacheroot, (reqSlug + ".json") ), json );

                appResponse.status( 200 ).json( json );
            });
        }

    // Request page?
    } else {
        requestJsonAndHtml( url, qrs, function ( data ) {
            functions.writeJson( path.join( config.server.cacheroot, ("page-" + reqSlug + ".json") ), data.json );
            functions.writeFile( path.join( config.server.cacheroot, ("page-" + reqSlug + ".html") ), functions.squashHtml( data.html ) );

            renderTemplate( appRequest.params[ 0 ], qrs, data.json, functions.squashHtml( data.html ), function ( tpl ) {
                appResponse.status( 200 ).send( tpl );
            });
        });
    }
}


/**
 *
 * @method processArguments
 * @param {object} args The arguments array
 * @private
 *
 */
function processArguments( args ) {
    var data = functions.readJson( path.join( __dirname, "package.json" ) );

    if ( !args || !args.length ) {
        console.log( "Squarespace Server" );
        console.log( "Version " + data.version );
        console.log();
        console.log( "Options:" );
        console.log( "sqs --version    Print package version" );
        console.log( "sqs --buster     Delete local site cache" );
        console.log( "sqs --server     Start the local server" );
        process.exit();
    }

    _.each( args, function ( arg ) {
        switch ( arg ) {
            case "--version":
                functions.log( data.version );
                process.exit();
            break;
            case "--buster":
                fse.removeSync( path.join( config.server.cacheroot ) );
                functions.log( "Trashed your local .sqs-cache." );
                process.exit();
            break;
            case "--server":
                startServer();
            break;
        }
    });
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
            setHeaderFooter,
            setSQSHeadersFooters
        );

    // Exit clause...
    if ( rIco.test( appRequest.params[ 0 ] ) || rApi.test( appRequest.params[ 0 ] ) ) {
        functions.log( "URL - " + appRequest.params[ 0 ] + " Not trying it" );

        appResponse.end();

        return;

    } else {
        functions.log( "GET - " + appRequest.params[ 0 ] );
    }

    // Authenticated
    if ( !config.server.secureauth ) {
        functions.log( "AUTH - Login to Squarespace!" );

        appResponse.send( functions.readFile( path.join( __dirname, "tpl/login.html" ) ) );

        return;
    }

    // Compose public server
    compose(function () {
        onCompositionDone( appRequest, appResponse );
    });
}


/**
 *
 * @method onExpressRouterPOST
 * @param {object} appRequest The express request
 * @param {object} appResponse The express response
 * @private
 *
 */
function onExpressRouterPOST( appRequest, appResponse ) {
    var data = {
            email: appRequest.body.email,
            password: appRequest.body.password
        },
        apis = [
            (config.server.siteurl + API_AUTH_LOGIN),
            (config.server.siteurl + API_GET_SITELAYOUT),
            (config.server.siteurl + API_GET_COLLECTIONS),
        ],
        headers,
        cookie;

    if ( !data.email || !data.password ) {
        functions.log( "Email AND Password required." );

        appResponse.send( functions.readFile( path.join( __dirname, "tpl/login.html" ) ) );

        return;
    }

    // POST to login
    request({
        method: "POST",
        url: apis.shift(),
        json: true,
        headers: getHeaders(),
        form: data

    }, function ( error, response, json ) {
        // errors...

        // Request to TokenLogin
        request({
            url: json.targetWebsite.loginUrl,
            json: true,
            headers: getHeaders(),
            qs: data

        }, function ( error, response, json ) {
            // errors...

            // Get the response cookie we need
            cookie = response.headers[ "set-cookie" ].join( ";" );

            // Apply cookie data to config
            config.server.secureauth = cookieParser.parse( cookie );

            // Set request headers we will use
            headers = getHeaders({
                "Cookie": cookie
            });

            // Cache local response header data
            functions.writeJson( path.join( config.server.cacheroot, "secureauth.json" ), config.server.secureauth );

            // Fetch site API data
            function getAPI() {
                var api = apis.shift(),
                    pathName = path.join( config.server.cacheroot, (api.replace( config.server.siteurl, "" ).replace( rSlash, "" ).replace( /\//g, "-" ) + ".json") );

                request({
                    url: api,
                    json: true,
                    headers: headers,
                    qs: data

                }, function ( error, response, json ) {
                    functions.writeJson( pathName, json );

                    // All done, load the site
                    if ( !apis.length ) {
                        config.server.siteData.collections = json;

                        appResponse.json({
                            success: true
                        });

                    } else {
                        config.server.siteData.siteLayout = json;

                        getAPI();
                    }
                });
            }

            getAPI();
        });
    });
}


/**
 *
 * @method startServer
 * @private
 *
 */
function startServer() {
    // Regex to match Squarespace Headers
    rSQSHeadersFull = new RegExp([
        "<\\!-- This is Squarespace. --><\\!-- ",
        config.name.toLowerCase(),
        " -->(.*?)<\\!-- End of Squarespace Headers -->"

    ].join( "" ));

    // Create express application
    app.use( express.static( config.server.webroot ) );
    app.use( bodyParser.json() );
    app.use( bodyParser.urlencoded( {extended: true} ) );
    app.set( "port", config.server.port );
    app.get( "*", onExpressRouterGET );
    app.post( "/", onExpressRouterPOST );
    app.listen( app.get( "port" ) );

    // Log that server is running
    functions.log( ("Running @http://localhost:" + app.get( "port" )) );
}


/**
 *
 * @export
 * @public
 * -------
 * @method init
 * @param {object} conf The template.conf json
 * @param {object} args The command arguments
 *
 */
module.exports = {
    init: function ( conf, args ) {
        // Create global config
        config = conf;

        // Create global config.server
        setServerConfig();

        // Create global directories
        setDirectories();

        // Handle arguments
        processArguments( args );
    }
};