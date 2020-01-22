# ChatParcels
ChatParcels is a web application that connects people with each other through chat rooms. An individual can create a server with a desired purpose. Each server can contain rooms that people can join and communicate within. 

## application.py
This is the Python file that manages the back-end. The main tools used are Flask, SocketIO and SQLAlchemy. This file handles user functionality like:
* login and register
* creating new servers
* sending the messages of the joined room to the client side
* rendering templates

## static/images/bg.png
This is the default image that is used as the background in the login and register page.

## static/script.js
This JavaScript file makes the application more dynamic mostly by performing AJAX requests and appending the received data to the page.
Some of the features of this script are:
* after submitting a form with wrong inputs, the wrong inputs are presented
* appends the servers the the user is a member of
* appends older messages after the user scrolled all the way up in the messages container
* it displays and hides containers that are meant to be displayed (e.g. when the user clicks on a server in the left hand side, 3 containers will become visible, while other 2 containers will be hidden)

## static/style.scss
Syntatically Awesome Style Sheets ([SASS](https://sass-lang.com/)) with the Scss syntax is used for styling. Compile this file to get the css file.

## templates/layout.html
This layout is used by the `templates/login_register.html` template and the `templates/index.html` template.
The file:
* gets the Bootstrap, Handlebars and SocketIO frameworks linked to the application through CDN's
* links with `static/style.css` and `static/script.js`
* has a remote font linked to it

## templates/login_register.html
This is a HTML template rendered when the user is not logged in. It displays the login and register forms.

## templates/index.html
This is a HTML template rendered when the user is logged in. It includes the containers (e.g. the containers of the user settings, messages, servers, etc.) and modals (e.g the modals with forms for creating and joining servers, creating rooms, deleting servers, etc.).
