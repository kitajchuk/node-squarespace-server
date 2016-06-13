node-squarespace-server
=======================

> A local Squarespace development server in [node.js](http://nodejs.org/).


### About
This tool lets [Squarespace Developers](http://developers.squarespace.com) build their templates locally by running a node.js proxy server to interface with a Squarespace site. It watches your template and recompiles when changes are made. It's ever a WIP, but a step in the right direction for open-source Squarespace development.



### Installation
```shell
npm install -g node-squarespace-server
```

#### Updating
```shell
npm update -g node-squarespace-server
```



### Usage
Navigate to your [Squarespace](http://squarespace.com) developer template and add to your `template.conf` file:

```json
"server": {
    "siteurl": "https://yoursite.squarespace.com"
}
```

If you are using a site-wide password, then you would have the following:

```json
"server": {
    "siteurl": "https://yoursite.squarespace.com",
    "password": "yoursitewidepassword"
}
```

If you are running a site in sandbox trial mode, then you would have the following:

```json
"server": {
    "siteurl": "https://yoursite.squarespace.com",
    "sandbox": true
}
```

And you will want to add this to your `.gitignore`:

```shell
# Ignore server cache
.sqs-cache
```

#### API

```shell
# View api
sqs

# Print package version
sqs --version

# Run the server
sqs server

# Run the server with forever
sqs server --forever

# Stop server started with forever
sqs server --fornever

# Run the server on a specific port
sqs server --port=8000

# Silence the server logging
sqs server --quiet

# Open new tab in browser
sqs server --open

# Change Squarespace authenticateAccount state
sqs server --auth

# Bust local cache
sqs buster
```

This runs the [express](http://expressjs.com) server on the relevant port. The default is `localhost:5050`.


### Troubleshooting
These are the most common causes for issues running the server and how to resolve them.

- Make sure you use the `https` protocol for your siteurl.
- Make sure you use the `"sandbox": true` setting in your template.conf if using an account in trial mode.
- When in doubt, bust your local cache with `sqs buster` and try again.
- If all else fails, [open an issue](https://github.com/kitajchuk/node-squarespace-server/issues/new) and lets get to the bottom of it.



### Workflow
You can use any front-end workflow you like when working with a custom Squarespace template. At the very least the separation of your source files and your actual template is recommended. The [templar](https://github.com/kitajchuk/templar) boilerplate project is one that aims to reduce the dependency footprint as well as provide a better suite of tools including [Webpack](https://webpack.github.io/), [ESLint](http://eslint.org/) and [Babel](http://babeljs.io/).



### Login
You will first be prompted with a login page. Enter your email and password for __YOUR__ Squarespace account ( used for logging into `/config` ) that is associated with __THIS__ Squarespace site. This information is stored with [node-keytar](https://github.com/atom/node-keytar) to enable auto-login when the server boots.



### Performance and Caching
When you make initial requests to the pages of your site, they will likely be slow. Imagine why. For every page the module needs to request both full `html` (for headers and footers parsing) and `json` (for rendering). That's 2 requests. For every `squarespace:query` and `squarespace:block-field` tag the module must make another request. Well, that's a lot of requests for sure. Luckily, the module caches everything via a `.sqs-cache` directory in your template root. This is good to speed things up. But, sometimes you want to pull down the latest and greatest content from your site. You can do this by hitting any page with a `?nocache` query string. To blow away your entire cache you can either delete it manually or use the `sqs buster` command.



### Squarespace authenticatedAccount JSON
When logged in to a Squarespace website, Squarespace adds an `authenticatedAccount` JSON object. This object is useful for creating conditional template code that renders only when logged in to Squarespace's backend config. This is common for automatically swapping out minified JavaScript links, Squarespace script combo-ing, or anything you want hidden to the public but displayed in the backend. Using the node-squarespace-server `--auth` arugment will allow you to move between `authenticatedAccount` states.



### Server-specific Template Code
The node-squarespace-server adds a new JSON key to the root Squarespace template JSON that allows you to write JSON-T template code that will only execute in your node server environment. To use it, simply use a Squarespace `.if` statement as specified in the [official documentation](https://developers.squarespace.com/templating-basics/). Because this JSON key is unsupported by Squarespace's own JSON-T dictionary, your code will never be seen on your production Squarespace template. 

Example usage:

```html
{.if nodeServer}
    <!-- Template code only seen on your local server. -->
{.end}
```


### Release
***Using the latest package versions is always recommended.***
- [node-squarespace-server@0.5.0](https://www.npmjs.com/package/node-squarespace-server)
 - [node-squarespace-jsont@0.1.23](https://www.npmjs.com/package/node-squarespace-jsont)
 - [node-squarespace-logger@0.1.1](https://www.npmjs.com/package/node-squarespace-logger)
 - [node-squarespace-middleware@0.3.0](https://www.npmjs.com/package/node-squarespace-middleware)



### Pull Requests
1. Fork it
2. Create your feature branch (`git checkout -b my-new-feature`)
3. Commit your changes (`git commit -am 'Add some feature'`)
4. Push to the branch (`git push origin my-new-feature`)
5. Create new Pull Request
