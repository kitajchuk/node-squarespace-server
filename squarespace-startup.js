// Executable startup javascript file...
var fs = require( "fs" ),
    cwd = process.cwd(),
    path = require( "path" ),
    args = [].slice.call( process.argv, 2 ),
    server = require( "./squarespace-server" ),
    config = path.join( cwd, "template.conf" );

config = ("" + fs.readFileSync( config ));
config = JSON.parse( config );

server.init( config, args );