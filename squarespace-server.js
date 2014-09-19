/*!
 *
 * Squarespace node server.
 *
 * @todo: squarespace:navigation
 * @todo: squarespace:query
 * @todo: squarespace:script
 * @todo: squarespace-headers
 * @todo: squarespace-footers
 * @todo: squarespace.main-content
 * @todo: /assets/[...]
 * @todo: {@|apply [...].block}
 * @todo: BadFormatters
 * @todo: BadPredicates
 * @todo: server.conf for settings
 *
 */
var express = require( "express" ),
    request = require( "request" ),
    app = express(),
    path = require( "path" ),
    http = require( "http" ),
    fs = require( "fs" ),
    jsont = require( "./lib/jsontemplate" ),
    matcher = require( "./lib/matchroute" ),

    SS_CONTENT = "{squarespace.main-content}",
    SS_HEADERS = "{squarespace-headers}",
    SS_FOOTERS = "{squarespace-footers}",

    headers = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_9_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/37.0.2062.94 Safari/537.36" }
    server = {},

    rSpaces = /^\s+|\s+$/,
    r2Hundo = /^(20\d|1223)$/,
    rBlocks = /\{\@\|apply\s(.*?)\}/g,
    rBlockTags = /^\{\@\|apply\s|\}$/g,
    rQueries = /\<squarespace:query(.*?)\<\/squarespace:query\>/g,
    rNavis = /\<squarespace:navigation(.*?)\/\>/g,
    rScripts = /\<squarespace:script(.*?)\/\>/g,

undefined_str = "",

more_predicates = function ( predicate_name ) {
    if ( predicate_name === "authenticatedAccount" ) {
        return function () {
            return false;
        };
    }
},

more_formatters = function ( formatter_name ) {
    
};

function readFile( path ) {
    var content;

    content = ("" + fs.readFileSync( path )).split( "\n" );
    content.forEach(function ( el, i ) {
        content[ i ] = el.replace( rSpaces, "" );
    });
    content = content.join( "" );

    return content;
}

/**
 *
 * gitroot: string
 * siteurl: string
 * password: string
 * webroot: string
 * port: number,
 * routes: object
 *
 */
server.init = function ( options ) {
    var url = options.siteurl,
        qrs = {
            format: "json"
        };

    if ( options.password ) {
        qrs.password = options.password;
    }

    app.use( express.static( options.webroot ) );
    app.set( "port", (options.port || 5050) );
    app.get( "*", function ( req, res ) {
        console.log( "> squarespace-server GET - " + req.url );

        request({
            url: url,
            json: true,
            headers: headers,
            qs: qrs

        }, function ( error, response, body ) {
            var template,
                matched,
                filed,
                block;

            if ( error ) {
                res.send( "> squarespace-server error" );
            }

            // Do 1xx / 2xx
            if ( r2Hundo.test( response.statusCode ) ) {
                // For jsont processing
                body.more_formatters = more_formatters;
                body.more_predicates = more_predicates;
                body.undefined_str = undefined_str;

                for ( var r in options.routes ) {
                    matched = matcher.compare( r, req.url );

                    // Route matched so do work
                    if ( matched.match ) {

                        // Template
                        template = readFile( path.join( options.webroot, options.routes[ r ] ) );

                        // Blocks
                        matched = template.match( rBlocks );

                        for ( var i = matched.length; i--; ) {
                            block = matched[ i ].replace( rBlockTags, "" );
                            filed = readFile( path.join( options.gitroot, "blocks", block ) );

                            template = template.replace( matched[ i ], filed );
                        }

                        // Navigations
                        matched = template.match( rNavis );
                        console.log( "Navigations" );
                        console.log( matched );
                        console.log( "" );

                        // Scripts
                        matched = template.match( rScripts );
                        console.log( "Scripts" );
                        console.log( matched );
                        console.log( "" );

                        // Queries
                        matched = template.match( rQueries );
                        console.log( "Queries" );
                        console.log( matched );
                        console.log( "" );

                    }
                }

                res.status( 200 ).send( template );

            // Do 4xx / 5xx
            } else {
                
            }
        });
    });

    http.Server( app ).listen( app.get( "port" ) );

    console.log( "> squarespace-server running on port " + app.get( "port" ) );
};

module.exports = server;