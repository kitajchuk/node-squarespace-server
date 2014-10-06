node-squarespace-server
=======================

> A local Squarespace development server in [node.js](http://nodejs.org/) for folks using the [developer platform](http://developers.squarespace.com/get-started).


## Installation
This is NOT finished. But, if you're interested, carry on. This is not yet published to [npm](http://npmjs.org), so your setup is as follows:

```shell
git clone git@github.com:kitajchuk/squarespace-server.git

cd squarespace-server

npm install -g .
```



## Usage
Navigate to your [Squarespace](http://squarespace.com) developer template and add to your `template.conf` file:

```json
"server": {
    "siteurl": "https://yourite.squarespace.com",
    "password": "sitewide password here if applicable"
}
```

Once you have that, a simple:

```shell
sqs
```

This runs the [express](http://expressjs.com) server on port `5050` for `localhost`.



## Notes
The primary purpose of this is to speed up aspects of development locally before you need to push to your Squarespace site. I think we can all agree that having to execute a `git push` to test your code is not practical. So, enjoy.

-BK