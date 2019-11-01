document.addEventListener("DOMContentLoaded", () => {
    // Handlebars equality checker helper
    Handlebars.registerHelper('is', (arg1, arg2, options) => {
        return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
    });

    // When the user is on the login and register page
    if (window.location.pathname == "/login_register") {
        // Template for login and register forms
        const logreg_template = Handlebars.compile(`
            {{#is form_name "register"}}
                <div class="form-group">
                    <label for="usern-inp">Username</label>
                    <input class="form-control" id="usern-inp" name="usern" type="text" autocomplete="off">
                </div>
            {{/is}}

            <div class="form-group">
                <label for="email-inp">Email</label>
                <input class="form-control" id="email-inp" name="email" type="email">
            </div>
            
            <div class="form-group">
                <label for="passw-inp">Password</label>
                <input class="form-control" id="passw-inp" name="passw" type="password">
            </div>

            {{#is form_name "register"}}
                <div class="form-group">
                    <label for="confirm-inp">Confirm password</label>
                    <input class="form-control" id="confirm-inp" name="confirm" type="password">
                </div>
            {{/is}}
            
            <div class="form-group">
                <input class="btn btn-success btn-block" type="submit" value="{{form_name}}">
            </div>
            
            {{#is form_name "register"}}
                <p>Already have an account? 
                    <button class="btn btn-link" id="form-replacer" data-form="login">Login</button>
                </p>
            {{/is}}
            
            {{#is form_name "login"}}
                <p>Don't have an account? 
                    <button class="btn btn-link" id="form-replacer" data-form="register">Register</button>
                </p>
            {{/is}}
        `);

        // Replaces a form (login or register) with the other
        const replace_form = (form_name) => {
            const form = document.querySelector("#logreg-form-cont form");
            const title = `ChatParcels - ${form_name.replace(/\b\w/, l => l.toUpperCase())}`;

            form.innerHTML = logreg_template({ "form_name": form_name });
            document.title = title;

            // Focusese on the first input
            form.querySelector("input").focus();

            // When the login or register form is being submitted
            form.onsubmit = (e) => validate_form(e, form_name);

            // When the "Register" or "Login" link was clicked
            document.querySelector("#form-replacer").onclick = (e) => {
                replace_form(e.target.dataset.form);
            };
        };

        // Loads the login form
        replace_form("login");
    }
    else {
        const user_circle = document.querySelector("#user-circle");
        const servers = document.querySelectorAll(".server-circle:not(:first-child):not(:last-child)");
        const profile_cont_body = document.querySelector("#profile-cont .cont-body");
        // const setting_cont_body = document.querySelector("#settings-cont .cont-body");
        const jservers_cont = document.querySelector("#joined-servers");
        const rooms_cont = document.querySelector("#rooms-cont");
        const users_cont = document.querySelector("#users-cont");
        const rooms_cont_body = rooms_cont.querySelector(".cont-body");
        const users_cont_body = users_cont.querySelector(".cont-body");

        const socket = io.connect(`${location.protocol}//${document.domain}:${location.port}`);
        const chat_area = document.querySelector("#chat-area");
        const chat_form = document.querySelector("#chat-form");
        const chat_inp = chat_form.querySelector("input[name=text]");

        let server_name = sessionStorage.getItem("server_name");
        let room_name;
        let last_msg_id;

        // Template for the "Create a server" and the "Join a server" forms 
        const add_server_template = Handlebars.compile(`
            <form id="{{#if is_create}}create{{else}}join{{/if}}-form" method="POST" enctype="multipart/form-data">
                <div class="form-group">
                    <label for="server-name-inp">Server Name</label>
                    <input class="form-control" id="server-name-inp" name="server-name" type="text" autocomplete="off">
                </div>
                
                {{#if is_create}}
                    <div class="form-group">
                        <label for="server-img-inp">Server Image</label>
                        <input class="form-control" id="server-img-inp" name="server-img" type="file" accept=".jpg,.png,.jpeg">
                    </div>
                {{/if}}

                <div class="form-group">
                    {{#if is_create}}
                        <input class="btn btn-block btn-primary" type="submit" value="CREATE THE SERVER">
                    {{else}}
                        <input class="btn btn-block btn-success" type="submit" value="JOIN THE SERVER">
                    {{/if}}
                </div>
            </form>
        `);

        // Template for a message block
        const message_template = Handlebars.compile(`
            {{#each messages}}
                <div class="chat-block">
                    <img class="img-fluid align-self-start" src="{{user_pic}}" alt="user pic">
                    <div>
                        <div>
                            <span class="text-info">{{username}}<span>
                            <span class="small text-muted">{{timestamp}}</span>
                        </div>
                        <div>{{message}}</div>
                    </div>
                </div>
            {{/each}}
        `);

        // Template for user profile (avatar, number messages sent, etc.)
        const user_profile_template = Handlebars.compile(`
            <img src="{{src}}" alt="profile pic">

            <div class="row">
                <div class="col-6 text-muted">Username</div>
                <div class="col-6 text-right">{{usern}}</div>
            </div>

            <div class="row">
                <div class="col-6 text-muted">Joined Server</div>
                <div class="col-6 text-right">{{servers_num}}</div>
            </div>

            <div class="row">
                <div class="col-6 text-muted">Messages</div>
                <div class="col-6 text-right">{{messages_num}}</div>
            </div>
        `);

        // Template for each server in the settings cont
        const jservers_template = Handlebars.compile(`
            {{#each servers}}
                <div class="row joined-server" data-name="{{name}}">
                    <div class="col-12 col-lg-8 d-flex flex-column">
                        <p>• <b class="text-info">{{name}}</b></p>
                        
                        <div class="row">
                            <div class="col-6 col-xl-5 small text-muted">
                                <p>Members</p>
                                <p>Open for everyone</p>
                            </div>

                            <div class="col-6 col-xl-5 small">
                                <p>{{members_num}}</p>
                                <p>
                                    {{is_open}}
                                    {{#if is_admin}}
                                        {{#if is_open}}
                                            (<button class="btn btn-link btn-sm text-warning close-server-btn" data-name="close-server">Close It</button>)
                                        {{else}}
                                            (<button class="btn btn-link btn-sm open-server-btn" data-name="open-server">Open It</button>)
                                        {{/if}}
                                    {{/if}}
                                </p>
                            </div>
                        </div>                        
                    </div>

                    <div class="col-12 col-lg-4 text-right d-flex flex-column">
                        {{#if is_admin}}
                            <button class="btn btn-success add-user-btn" data-name="add-user">Add User</button>
                            <button class="btn btn-danger del-server-btn" data-name="del-server">Delete Server</button>
                        {{else}}
                            <button class="btn btn-danger leave-server-btn" data-name="leave-server">Leave Server</button>
                        {{/if}}
                    </div>
                </div>
            {{/each}}
        `);

        // Loads new messages when scrolled to the top
        const load_new_msgs = () => {
            // Gets "true" if the user reached scrollTop <= 70, else "false"
            const is_loading = chat_area.dataset.loading;

            // If no messages are in the loading queue, start loading
            if (is_loading == "no" && chat_area.scrollTop <= 70) {
                const request = new XMLHttpRequest();
                const data = new FormData();
                
                // Disable the the scroll event 
                chat_area.dataset.loading = "yes";
                
                data.append("server_name", server_name);
                data.append("room_name", room_name);
                data.append("last_msg_id", last_msg_id);
                
                request.open("POST", "/room_data");
                
                request.onload = () => {
                    const messages = JSON.parse(request.responseText).messages;
                    const new_msgs_cont = document.querySelector(".new-messages-cont");
                    
                    // Scrolls a pixel down so the messages will appear up
                    chat_area.scrollTop = 70;
                    
                    // Remove the loading messages cont
                    if (new_msgs_cont) {
                        chat_area.removeChild(new_msgs_cont);
                    }

                    // If messages were returned (the user's didn't loaded all the messages yet)
                    if (messages.length) {
                        // Get the id of the last message 
                        last_msg_id = messages[0].msg_id;

                        // Appends the newly loaded messages
                        chat_area.insertAdjacentHTML("afterbegin", message_template({ "messages": messages }));

                        // If messages were returned from the server
                        if (messages.length) {
                            // Append a new loading messages cont
                            chat_area.insertAdjacentHTML("afterbegin", `
                                <div class="new-messages-cont">
                                    <div class="loading-sign"></div>
                                </div> 
                            `);
    
                            // Reenable the the scroll event 
                            chat_area.dataset.loading = "no";
                        }
                    }
                };

                request.send(data);
            }
        }

        // When the socket is connected
        socket.on("connect", () => {
            chat_form.onsubmit = (e) => {
                e.preventDefault();

                // Send the text to the backend
                socket.emit("send text", {
                    "message": chat_inp.value,
                    "server_name": sessionStorage.getItem("server_name"),
                    "room_name": document.querySelector(".selected-room").innerHTML,
                });
                
                chat_inp.value = "";
            };
        });

        // When the text was announced in the backend,
        // broadcast the text to everyone in the room
        socket.on("announce text", (data) => {
            // Selects the div with the message "There are no messages on this room"
            const chat_area_empty = document.querySelector(".empty-cont");

            // Removes that div if it exists
            if (chat_area_empty) {
                chat_area.removeChild(chat_area_empty);
            }

            // Appends the sent message to every user in the room
            chat_area.insertAdjacentHTML("beforeend", message_template({ "messages": [data] }));
            
            // Scrolls to the bottom of the chat area after each new message
            chat_area.scrollTop = chat_area.scrollHeight - chat_area.clientHeight
        });

        rooms_cont_body.addEventListener("mouseenter", () => {
            users_cont.style.height = "40vh";
            rooms_cont.style.height = "60vh";
        });

        users_cont_body.addEventListener("mouseenter", () => {
            users_cont.style.height = "60vh";
            rooms_cont.style.height = "40vh";
        });

        // Resets the height of the containers when the mouse leaves
        [rooms_cont, users_cont].forEach((cont) => {
            cont.addEventListener("mouseleave", () => {
                users_cont.style.height = "50vh";
                rooms_cont.style.height = "50vh";
            });
        });

        // Loops through every circle on the left side
        [user_circle, ...servers].forEach((circ) => {
            circ.addEventListener("click", (e) => {
                // Differentiate the selected server from the rest of the servers
                document.querySelector(".selected-server").classList.remove("selected-server");
                e.target.classList.add("selected-server");
                
                // Shows the loading sign for each container
                [
                    profile_cont_body,
                    jservers_cont,
                    rooms_cont_body,
                    users_cont_body,
                    chat_area
                ].forEach((el) => el.innerHTML = `<div class="loading-sign"></div>`);
            });
        });

        // When the user circle (the first circle) is clicked
        user_circle.addEventListener("click", () => {
            const request = new XMLHttpRequest();
            
            // Displays the user's profile and settings page
            show_user_conts(true);

            document.title = "ChatParcels";

            // Makes this page the default (on reload)
            sessionStorage.removeItem("server_name");

            request.open("POST", "/user_data")
            
            request.onload = () => {
                const response = JSON.parse(request.responseText);
                const jservers = { "servers": response.servers };
                const user_profile = {
                    "src": response.user_pic,
                    "usern": response.usern,
                    "servers_num": jservers.servers.length,
                    "messages_num": response.messages_num,
                };

                // Displays the user profile and settings
                profile_cont_body.innerHTML = user_profile_template(user_profile);
                jservers_cont.innerHTML = jservers_template(jservers);

                document.querySelectorAll(".joined-server").forEach((server) => {
                    // Opens the server the user clicked on
                    server.addEventListener("click", (e) => {
                        // Makes sure the buttons were not clicked
                        if (e.target == server || !e.target.classList.contains("btn")) {
                            document.querySelector(`.server-circle[data-name="${server.dataset.name}"]`).click();
                        }
                    });
                });

                // Select all the buttons in the joined servers container
                jservers_cont.querySelectorAll(".btn").forEach((btn) => {
                    btn.addEventListener("click", () => {
                        const server_name = btn.closest(".joined-server").dataset.name;

                        // Displays the correct modal for the clicked button
                        document.querySelector(`#${btn.dataset.name}-modal`).style.display = "block";
                        
                        sessionStorage.setItem("manage_server", server_name);
                    });
                });
            }
            
            request.send();
        });

        // If there are no servers to click by default
        if (!server_name) user_circle.click();

        servers.forEach((server) => {
            // When a server circle is clicked
            server.addEventListener("click", () => {
                const request = new XMLHttpRequest();
                const data = new FormData();
                const add_room = document.querySelector("#add-room");
                const add_user = document.querySelector("#add-user");
                
                server_name = server.dataset.name;

                document.title = "ChatParcels - " + server_name;
                
                // Remove the variable so that add user btn doesn't intersect with the "+" btn
                sessionStorage.removeItem("manage_server");

                // Fixes the load of messages
                chat_area.removeEventListener("scroll", load_new_msgs);

                // Keeps track of the server name so it can be used when sending messages
                sessionStorage.setItem("server_name", server_name);
                // Sends the name of the clicked server to the back-end
                data.append("server_name", server_name);

                // Hides the profile and setting conts and show the other 3 conts
                show_user_conts(false);

                // Hides some elements that might be re-displayed later
                chat_form.style.display = "none";
                add_room.style.display = "none";
                add_user.style.display = "none";

                request.open("POST", "/server_data");

                request.onload = () => {                    
                    const response = JSON.parse(request.responseText);
                    
                    // Display the "add room" and "add member" buttons if the user is admin
                    if (response.is_admin) {
                        add_room.style.display = "block";
                        add_user.style.display = "block";
                    }
                    
                    // Empty the containers
                    [rooms_cont_body, users_cont_body, chat_area].forEach((body) => {
                        body.innerHTML = "";
                    });

                    // Appends the rooms
                    for (room_name in response.rooms) {
                        rooms_cont_body.insertAdjacentHTML("beforeend", `
                            <div class="room">${room_name}</div>
                        `);
                    }

                    const rooms = document.querySelectorAll(".room");

                    // If there are no rooms on the server
                    if (!rooms.length) {
                        rooms_cont_body.innerHTML = `
                            <div class="empty-cont">There are no rooms on this server.</div>
                        `;
                    }
                    else {
                        // Iterates through each room
                        rooms.forEach((room) => {
                            room_name = room.innerHTML;

                            // Display the chatting form if at least one room was found
                            chat_form.style.display = "block";

                            room.addEventListener("click", (e) => {
                                const request = new XMLHttpRequest();
                                const data = new FormData();
                                const selected_room = document.querySelector(".selected-room");

                                room_name = room.innerHTML;
                                // Variable used for for loading all the messages by id until id 1999999999
                                last_msg_id = 1999999999;

                                chat_area.dataset.loading = "no"; // Reenables the the scroll event
                                chat_inp.value = "";
                                chat_inp.focus(); // Focuses on the input of the form
                                chat_area.removeEventListener("scroll", load_new_msgs);

                                // Emits the server and room name
                                socket.emit("leave join room", {
                                    "server_name": server_name,
                                    "room_name": room_name,
                                });

                                // Keeps track of the room name so it can be used when sending messages
                                sessionStorage.setItem(server_name, room_name);
                                // Shows the loading sign
                                chat_area.innerHTML = `<div class="loading-sign"></div>`;

                                data.append("room_name", room_name);
                                data.append("server_name", server_name);
                                data.append("last_msg_id", last_msg_id);

                                // Removes the the selected-room class if one exists
                                if (selected_room) {
                                    selected_room.classList.remove("selected-room");
                                }

                                // Adds a class of selected-room for the clicked room   
                                e.target.classList.add("selected-room");

                                request.open("POST", "/room_data");

                                request.onload = () => {
                                    const messages = JSON.parse(request.responseText).messages;

                                    if (messages.length) {
                                        // Get the id of the last message 
                                        last_msg_id = messages[0].msg_id;

                                        chat_area.innerHTML = `
                                            <div class="new-messages-cont">
                                                <div class="loading-sign"></div>
                                            </div>
                                        `;

                                        // Appends the latest messages
                                        chat_area.insertAdjacentHTML("beforeend", message_template({ "messages": messages }));

                                        // Scroll to the bottom of the chat area
                                        chat_area.scrollTop = chat_area.scrollHeight - chat_area.clientHeight

                                        // Loads more messages when needed
                                        chat_area.addEventListener("scroll", load_new_msgs);

                                        // Makes the loading cont dissapear if there are no messages to load
                                        if (chat_area.scrollTop == 0) {
                                            load_new_msgs();
                                        }
                                    }
                                    // If there are no messages on the room
                                    else {
                                        chat_area.innerHTML = `
                                            <div class="empty-cont">There are no messages on this room.</div>
                                        `;
                                    }
                                };

                                request.send(data);
                            });

                            // Automatically clicks the last visited room if any
                            if (sessionStorage[sessionStorage.getItem("server_name")] == room_name) {
                                room.click();
                            }
                        });

                        // Click on the first room if no room was clicked
                        if (!document.querySelector(".selected-room")) {
                            rooms[0].click();
                        }
                    }
                    
                    // Appends the users
                    for (let usern in response.users) {
                        users_cont_body.insertAdjacentHTML("beforeend", `
                            <div class="user">
                                <img class="img-fluid" src="${response.users[usern]}" alt="profile_pic">
                                ${usern}
                            </div>
                        `);
                    }
                };

                request.send(data);
            });
        });

        // The server that was last visited
        const server = document.querySelector(`.server-circle[data-name="${server_name}"]`);
        // The the "Create a server" and "Join a server" buttons
        const add_server_btns = document.querySelectorAll("#create-server-btn, #join-server-btn");
        // The div that contains the create and join forms
        const add_server_form_cont = document.querySelector("#add-server-form-cont");
        
        // Automatically clicks on the last visited server if any
        if (server) server.click();

        // When the dark area around all the modals is clicked
        document.querySelectorAll(".modal").forEach((modal) => {
            modal.addEventListener("click", (e) => {
                if (e.target.classList.contains("modal")) {
                    e.target.style.display = "none";
                    add_server_form_cont.innerHTML = "";
                    
                    // Enables both "Create a server" and "Join a server" buttons
                    reset_modal(false, false);
                }
            });
        });

        // When the "Create a server" or the "Join a server" button is clicked
        add_server_btns.forEach((btn) => {
            btn.addEventListener("click", (e) => {
                const is_create = e.target.getAttribute("id").includes("create");
                const create_join = is_create ? "create" : "join";

                // Disables the clicked btn and enables the other btn
                reset_modal(!is_create, is_create);

                // Displays the correct form
                add_server_form_cont.innerHTML = add_server_template({ "is_create": is_create });

                // Adds submit event for the displayed form
                document.querySelector(`#${create_join}-form`).onsubmit = (e) => {
                    validate_form(e, `${create_join}_server`);
                }
            });
        });

        // When the buttons to add servers, rooms, users is clicked, display a modal
        document.querySelectorAll("#add-server, #add-room, #add-user").forEach((el) => {
            el.addEventListener("click", () => {
                document.querySelector(`#${el.getAttribute("id")}-modal`).style.display = "block";
            });
        });

        // The forms: add-room, add-user, del-server, leave-server, open-server, close-server
        document.querySelectorAll(".static_modal_forms").forEach((form) => {
            form.onsubmit = (e) => {
                // From "add-user-form" to "add_user_form"
                const form_id = e.target.getAttribute("id").replace(/-/g, "_");

                // From "add_user_form" to "add_user"
                validate_form(e, form_id.replace("_form", ""));
            }
        });
    }
});


// Indicates the errors on the forms, if any, with AJAX
const validate_form = (e, backend_route) => {
    e.preventDefault();

    const request = new XMLHttpRequest();
    const inputs = document.querySelectorAll("input:not([type=submit])");
    const data = new FormData();

    // Adds each input and its value to the form data
    inputs.forEach((inp) => {
        data.append(inp.getAttribute("name"), inp.value);
    });

    // Appends the server name the user wants to manage in settings
    data.append("manage_server", sessionStorage.getItem("manage_server"));

    // Removes the errors before submiting a new form
    document.querySelectorAll(".error-msg").forEach((msg) => {
        const form_group = msg.parentNode;

        form_group.querySelector("label").classList = "";
        form_group.querySelector(".form-control").style.border = "none";

        if (document.querySelector(".error-msg")) {
            form_group.removeChild(document.querySelector(".error-msg"));
        }
    });
    
    // Opens a request for the specified route (e.g /login, /create_server)
    request.open("POST", `/${backend_route}`);

    request.onload = () => {
        const errors = JSON.parse(request.responseText).errors;
        
        // If no errors were returned, redirect to "/"
        if (Object.keys(errors).length === 0) {
            location.href = "/";
        }

        for (inp_name in errors) {
            const inp_label = document.querySelector(`label[for=${inp_name}-inp]`);
            const inp = document.querySelector(`input[name=${inp_name}]`);
            const error_msg = document.createElement("span");

            /* Turns the color of the label into red
               Appends a red error message next to the label
               Turns the border of the input into red */
            inp_label.classList = "text-danger";
            error_msg.classList = "text-danger font-italic small error-msg";
            error_msg.innerHTML = `- ${errors[inp_name]}`;
            inp.parentNode.insertBefore(error_msg, inp);
            inp.style.border = "1px solid var(--red)";
        }
    };

    // Send the request with the form data to the server
    request.send(data);
};

// Displays the profile and settings containers OR the rooms, users and texts containers
const show_user_conts = (show) => {
    const conts1 = document.querySelectorAll("#profile-cont, #settings-cont");
    const conts2 = document.querySelectorAll("#rooms-users-cont, #texts-cont");
    // The default: display profile and settings conts
    let a = "block", b = "none";
    
    // If show is "false": display the rooms, users and texts conts
    if (!show) a = "none", b = "block";

    conts1.forEach((cont) => {
        cont.setAttribute("style", `display: ${a}`);
    });

    conts2.forEach((cont) => {
        cont.setAttribute("style", `display: ${b}`);
    });
};

// Enables/disables the buttons and removes the "create" and "join" forms from the modal
const reset_modal = (create, join) => {
    const create_btn = document.querySelector("#create-server-btn");
    const join_btn = document.querySelector("#join-server-btn");

    create_btn.removeAttribute("disabled");
    join_btn.removeAttribute("disabled");

    if (join) {
        create_btn.setAttribute("disabled", "");
    }
    else if (create) {
        join_btn.setAttribute("disabled", "");
    }
};