import os
import re

from flask import Flask, render_template, redirect, session, request
from flask_session import Session
from flask_socketio import SocketIO, emit, join_room, leave_room, rooms
from sqlalchemy import create_engine
from sqlalchemy.orm import scoped_session, sessionmaker
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY")
socketio = SocketIO(app)

# Configure session to use filesystem
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
Session(app)

# Configure database
engine = create_engine(os.getenv("DATABASE_URL"))
db = scoped_session(sessionmaker(bind=engine))


def pic_path(folder, id):
    """Takes a folder name and an ID (user or server ID's) and returns a path to a picture"""
    path = f"static/images/{folder}/{id}.jpg"

    # If the path exists
    if os.path.isfile(path):
        return path
    # Rerurns the default pic
    return f"static/images/{folder}/default.jpg"


@app.route("/", methods=["GET"])
def index():
    """Renders the main page"""
    if not session:
        return redirect("/login_register")

    # Get all the servers that the user is a member of
    servers = db.execute("""SELECT id, name, users FROM servers
                         WHERE :uid=any(string_to_array(users, ';')) ORDER BY name""",
                         {"uid": str(session["uid"])}).fetchall()
    server_imgs = {}

    # Gets the paths of profile pics of each server
    for server in servers:
        server_imgs[server["id"]] = pic_path("servers_pics", server["id"])

    return render_template("index.html", servers=servers, server_imgs=server_imgs)

@app.route("/login_register", methods=["GET", "POST"])
def login_register():
    """Renders the login and register page"""
    if session:
        return redirect("/")

    return render_template("login_register.html")

@app.route("/login", methods=["POST"])
def login():
    """Logs in users"""
    email = request.form.get("email")
    passw = request.form.get("passw")
    validation = {"errors": {}}
    
    # Fields must be filled
    if not email:
        validation["errors"]["email"] = "This field is required."
    if not passw:
        validation["errors"]["passw"] = "This field is required."

    # If at least one field is empty
    if not (email and passw):
        return validation
    
    try:
        # Catches "TypeError: 'NoneType' object is not subscriptable" if the id can't be found
        uid = db.execute("SELECT id FROM users WHERE email=:email",
                         {"email": email}).fetchone()[0]
    except TypeError:
        validation["errors"]["email"] = "The email can't be found."
        return validation

    # Fetch the user's hash from the database
    hsh = db.execute("SELECT hash FROM users WHERE id=:id",
                     {"id": uid}).fetchone()[0]

    # The password is wrong
    if not check_password_hash(hsh, passw):
        validation["errors"]["passw"] = "The password doesn't match."
        return validation

    session["uid"] = uid
    session["usern"] = db.execute("SELECT username FROM users WHERE id=:uid",
                                  {"uid": uid}).fetchone()[0]

    # No errors were found
    return validation

@app.route("/register", methods=["POST"])
def register():
    """Registers users"""
    usern = request.form.get("usern")
    email = request.form.get("email")
    passw = request.form.get("passw")
    confirm = request.form.get("confirm")
    hsh = generate_password_hash(passw)
    validation = {"errors": {}}

    if not usern:
        validation["errors"]["usern"] = "This field is required."
    if not email:
        validation["errors"]["email"] = "This field is required."
    if not passw:
        validation["errors"]["passw"] = "This field is required."
    if not confirm:
        validation["errors"]["confirm"] = "This field is required."

    # If at least one field is empty
    if not (usern and email and passw and confirm):
        return validation

    # The password must be secure
    if not re.match(r"(?=.*[a-z])(?=.*[A-Z])(?=.*[!@#$%^&*?~\\/|<>,.0-9]).{8,26}", passw):
        validation["errors"]["passw"] = "Use at least: 8 characters; 1 uppercase and 1 lowercase letter; 1 digit or 1 symbol"
        return validation

    # The passwords must match
    if passw != confirm:
        validation["errors"]["confirm"] = "The passwords don't match."
        return validation

    # Returns "True" if username/email exists, "False" otherwise
    usern_exists = db.execute("SELECT EXISTS(SELECT * FROM users WHERE username=:usern)",
                              {"usern": usern}).fetchone()[0]
    email_exists = db.execute("SELECT EXISTS(SELECT * FROM users WHERE email=:email)",
                              {"email": email}).fetchone()[0]

    # Returns to the user if the username/email subbmited already exists
    if usern_exists:
        validation["errors"]["usern"] = "Username is already taken."
        return validation
    elif email_exists:
        validation["errors"]["email"] = "Email is already taken."
        return validation

    # Insert the new user into the "users" table
    db.execute("INSERT INTO users (username, email, hash) VALUES (:usern, :email, :hash)",
               {"usern": usern, "email": email, "hash": hsh})
    db.commit()

    # Log the new user in
    session["uid"] = db.execute("SELECT id FROM users WHERE username=:usern",
                                {"usern": usern}).fetchone()[0]
    session["usern"] = db.execute("SELECT username FROM users WHERE id=:uid",
                                  {"uid": session["uid"]}).fetchone()[0]

    # No errors were found
    return validation

@app.route("/user_data", methods=["POST"])
def user_data():
    """Returns user's info (profile and settings)"""
    uid = session["uid"]

    # Gets the servers that the user is a member of
    servers = db.execute("""SELECT name, admin, users, open
                         FROM servers
                         WHERE :uid = any(string_to_array(users, ';'))
                         ORDER BY name""",
                         {"uid": str(uid)}).fetchall()

    messages_num = db.execute("SELECT COUNT(*) FROM messages WHERE sender_id = :uid",
                              {"uid": uid}).fetchone()[0]
    
    # Converts the servers data into JSON
    servers = [
        {
            "name": server["name"],
            "is_admin": uid == server["admin"],
            "is_open": server["open"],
            "members_num": len(server["users"].split(";")),
        } for server in servers
    ]

    # Sort the object by the servers the user is an admin of
    servers.sort(key=lambda server: server["is_admin"], reverse=True)
    
    data_to_send = {
        "usern": session["usern"],
        "user_pic": pic_path("users_pics", uid),
        "servers": servers,
        "messages_num": messages_num
    }

    return data_to_send

@app.route("/create_server", methods=["POST"])
def create_server():
    """Creates a server"""
    name = request.form.get("server-name")
    img = request.files.get("server-img")
    uid = session["uid"]
    validation = {"errors": {}}
    
    #####################
    print(name)
    print(img)
    print()
    print(request.files)    
    
    # If the field is empty
    if not name:
        validation["errors"]["server-name"] = "This field is required."
        return validation

    # If the name of the server is too long
    if len(name) > 32:
        validation["errors"]["server-name"] = "Use a name that has a length of maximum 32 characters."
        return validation

    # If the user uploaded an image
    if img:
        print("image found")
        # f = open(img)
        # f.write(f"/static/images/servers_pics/1.jpg")
    
    try:
        db.execute("""INSERT INTO servers
                   (name, admin, users) VALUES
                   (:name, :admin, :users)""",
                   {"name": name, "admin": uid, "users": uid})
        db.commit()
    except:
        # If the server name exists
        validation["errors"]["server-name"] = "The server name alredy exists."
        return validation

    return validation

@app.route("/join_server", methods=["POST"])
def join_server():
    """Joins a server"""
    name = request.form.get("server-name")
    validation = {"errors": {}}

    # If the field is empty
    if not name:
        validation["errors"]["server-name"] = "This field is required."
        return validation

    server_exists = db.execute("SELECT EXISTS(SELECT * FROM servers WHERE name=:name)",
                               {"name": name}).fetchone()[0]
    
    # If the server name doesn't exist
    if not server_exists:
        validation["errors"]["server-name"] = "The server doesn't exist."
        return validation

    server = db.execute("SELECT id, users, open FROM servers WHERE name=:name",
                        {"name": name}).fetchone()
    
    # If the user is already a member of the server
    if str(session["uid"]) in server["users"].split(";"):
        validation["errors"]["server-name"] = "You are already a member of this server."
        return validation

    # If the server is not open for everybody
    if not server["open"]:
        validation["errors"]["server-name"] = "The server is not open for everybody."
        return validation

    # Adds the users to the server
    db.execute("UPDATE servers SET users=:users WHERE id=:server_id",
               {"users": f"{server['users']};{session['uid']}", "server_id": server["id"]})
    db.commit()

    # No errors were found
    return validation

@app.route("/server_data", methods=["POST"])
def server_data():
    """Returns the chat rooms, chat users and room's texts"""
    name = request.form.get("server_name")
    uid = session["uid"]
    data_to_send = {"rooms": {}, "users": {}, "is_admin": False}
    # Gets the server that the user clicked
    server = db.execute("SELECT id, admin, users FROM servers WHERE name=:name",
                        {"name": name}).fetchone()
    # Gets the rooms of the server
    server_rooms = db.execute("SELECT id, name FROM rooms WHERE server_id=:server_id",
                              {"server_id": server["id"]}).fetchall()
    # Gets all the usernames of the server users
    users = db.execute("""SELECT id, username FROM users
                       WHERE id IN :users ORDER BY username""",
                       {"users": tuple(server["users"].split(";"))}).fetchall()
    # Used when creating a room or inviting a user
    session["server_id"] = server["id"]

    # If the user is not a member of the server
    if str(uid) not in server["users"].split(";"):
        return data_to_send

    # If the logged in user is the admin of the server
    if uid == server["admin"]:
        data_to_send["is_admin"] = True

    if server_rooms:
        # Appends the rooms
        for room in server_rooms:
            data_to_send["rooms"][room["name"]] = {}
        
        # Appends the users. e.g.: "my_usern": "21.jpg"
        for user in users:
            data_to_send["users"][user["username"]] = pic_path("users_pics", user["id"])

    return data_to_send

@app.route("/room_data", methods=["POST"])
def room_data():
    """Returns the room's messages its data"""
    server_name = request.form.get("server_name")
    room_name = request.form.get("room_name")
    # The id of the message on the top of the chat area
    last_msg_id = request.form.get("last_msg_id")

    room_id = db.execute("""SELECT id FROM rooms
                         WHERE name=:name AND server_id=:sid""",
                         {"name": room_name,
                         "sid": session["server_id"]}).fetchone()[0]

    # Selects the next (the last if the user didn't scrolled to the top) X messages
    msgs = db.execute("""SELECT messages.id, users.username,
                      messages.sender_id, messages.message,
                      messages.timestamp FROM messages
                      JOIN users ON users.id = messages.sender_id
                      WHERE messages.room_id = :room_id
                      AND messages.id < :last_msg_id
                      ORDER BY messages.timestamp DESC LIMIT 26""",
                      {"room_id": room_id,
                      "last_msg_id": last_msg_id}).fetchall()
    
    data_to_send = {"messages": []}

    for msg in msgs:
        data_to_send["messages"].append({
            "msg_id": msg[0],
            "username": msg[1],
            "user_pic": pic_path("users_pics", msg[2]),
            "message": msg[3],
            "timestamp": msg[4]
        })
    
    data_to_send["messages"].sort(key=lambda msg: msg["timestamp"])

    return data_to_send

@app.route("/create_room", methods=["POST"])
def create_room():
    """Creates a room for a server"""
    room = request.form.get("room-name")
    validation = {"errors": {}}
    server = db.execute("SELECT id, admin FROM servers WHERE id=:server_id",
                        {"server_id": session["server_id"]}).fetchone()
    
    # If the user is not the admin of the server
    if server["admin"] != session["uid"]:
        validation["errors"]["room-name"] = "You are not the admin of the server."
        return validation

    # If the field is empty
    if not room:
        validation["errors"]["room-name"] = "This field is required."
        return validation

    # If the name of the room is too long
    if len(room) > 24:
        validation["errors"]["room-name"] = "Use a name that has a length of maximum 24 characters."
        return validation
    
    try:
        db.execute("INSERT INTO rooms (name, server_id) VALUES (:name, :server_id)",
                   {"name": room, "server_id": server["id"]})
        db.commit()
    except:
        # If there is a room with the same name on the server
        validation["errors"]["room-name"] = "The name is already in use on this server."
        return validation

    return validation

@app.route("/add_user", methods=["POST"])
def add_user():
    """Adds the users to the users list of a server"""
    usern = request.form.get("username")
    server_name = request.form.get("manage_server")
    validation = {"errors": {}}

    try:
        # If a user was tried to be added from setting, change session["server_id"]
        session["server_id"] = db.execute("SELECT id FROM servers WHERE name=:name",
                                          {"name": server_name}).fetchone()["id"]
    except:
        # If a user was tried to be added from the members container
        print("'+' button was used.")

    server = db.execute("SELECT id, admin, users, open FROM servers WHERE id=:server_id",
                        {"server_id": session["server_id"]}).fetchone()
    user_to_add = db.execute("SELECT id FROM users WHERE username=:usern",
                            {"usern": usern}).fetchone()

    # If the user is not the admin of the server
    if server["admin"] != session["uid"]:
        validation["errors"]["username"] = "You are not the admin of the server."
        return validation

    # If the field is empty
    if not usern:
        validation["errors"]["username"] = "This field is required."
        return validation

    # If the username doesn't exist
    if not user_to_add:
        validation["errors"]["username"] = "The user doesn't exist."
        return validation

    # If the user is already a member of the server
    if str(user_to_add["id"]) in server["users"].split(";"):
        validation["errors"]["username"] = "That user is already a member of this server."
        return validation

    # Adds the users to the server
    db.execute("UPDATE servers SET users=:users WHERE id=:server_id",
               {"users": f"{server['users']};{user_to_add['id']}",
               "server_id": server["id"]})
    db.commit()

    # No errors were found
    return validation

@app.route("/del_server", methods=["POST"])
def del_server():
    """Deletes a server"""
    server_name = request.form.get("manage_server")
    validation = {"errors": {}}
    server = db.execute("SELECT id, admin FROM servers WHERE name=:server_name",
                        {"server_name": server_name}).fetchone()

    # Makes sure the user is the admin
    if server["admin"] == session["uid"]:
        # Select the ID's of every room of the deleted server
        room_ids = db.execute("SELECT id FROM rooms WHERE server_id=:server_id",
                              {"server_id": server["id"]}).fetchall()
        room_ids = [room[0] for room in room_ids]
        
        if room_ids:
            # Delete the server's messages
            db.execute("DELETE FROM messages WHERE room_id = ANY(:room_ids)",
                       {"room_ids": room_ids})
            db.commit()

        # Delete the server's rooms
        db.execute("DELETE FROM rooms WHERE server_id=:server_id",
                   {"server_id": server["id"]})
        db.commit()

        # Delete the server
        db.execute("DELETE FROM servers WHERE id=:server_id",
                   {"server_id": server["id"]})
        db.commit()

    return validation

@app.route("/leave_server", methods=["POST"])
def leave_server():
    """Leaves a server"""
    server_name = request.form.get("manage_server")
    uid = session["uid"]
    validation = {"errors": {}}
    users = db.execute("SELECT users FROM servers WHERE name=:server_name",
                       {"server_name": server_name}).fetchone()[0].split(";")
    
    # Makes sure the user is a member of the server
    if str(uid) in users:
        # Removes the user from the set
        db.execute("UPDATE servers SET users=:users WHERE name=:server_name",
                   {"users": ";".join(list(users)),
                   "server_name": server_name})
        db.commit()

    return validation

@app.route("/open_server", methods=["POST"])
def open_server():
    """Opens a server so anyone can join"""
    server_name = request.form.get("manage_server")
    validation = {"errors": {}}
    admin_id = db.execute("SELECT admin FROM servers WHERE name=:server_name",
                          {"server_name": server_name}).fetchone()[0]

    # Makes sure the user is the admin
    if admin_id == session["uid"]:
        # Opens the server
        db.execute("UPDATE servers SET open=True WHERE name=:server_name",
                   {"server_name": server_name})
        db.commit()

    return validation

@app.route("/close_server", methods=["POST"])
def close_server():
    """Closes a server so only the admin can add users"""
    server_name = request.form.get("manage_server")
    validation = {"errors": {}}
    admin_id = db.execute("SELECT admin FROM servers WHERE name=:server_name",
                          {"server_name": server_name}).fetchone()[0]

    # Makes sure the user is the admin
    if admin_id == session["uid"]:
        # Closes the server
        db.execute("UPDATE servers SET open=False WHERE name=:server_name",
                   {"server_name": server_name})
        db.commit()

    return validation

@socketio.on("leave join room")
def leave_join_room(data):
    """Leaves the previous room and joins the clicked room"""
    if rooms():
        leave_room(rooms()[0])

    join_room(data["server_name"] + "/" + data["room_name"])

@app.route("/signout")
def signout():
    """Signs the user out"""
    session.clear()

    return redirect("/")

@socketio.on("send text")
def text(data):
    """Stores the messages in the db and broadcasts the messages"""
    server_name = data["server_name"]
    room_name = data["room_name"]
    msg = data["message"]

    # Rejects empty strings as messages
    if msg == "":
        return

    usern = db.execute("SELECT username FROM users WHERE id=:uid",
                       {"uid": session["uid"]}).fetchone()[0]

    try:
        room_id = db.execute("""SELECT rooms.id FROM rooms
                            JOIN servers ON rooms.server_id = servers.id
                            WHERE rooms.name=:rname AND servers.name=:sname""",
                            {"rname": room_name,
                            "sname": server_name}).fetchone()[0]
    # If the room of the server couldn't be found
    except TypeError:
        return

    # Gets a string with all the members of the server
    server_users = db.execute("SELECT users FROM servers WHERE name=:name",
                              {"name": server_name}).fetchone()[0]
    
    # Checks if the user sent the message to a server he is a member of
    if str(session["uid"]) not in server_users.split(";"):
        return
    
    # Stores the message in the db
    db.execute("""INSERT INTO messages (sender_id, room_id, message)
               VALUES (:sender_id, :room_id, :message)""",
               {"sender_id": session["uid"],
               "room_id": room_id,
               "message": msg})
    db.commit()
    
    # Gets the room id and the timestamp of the message
    timestamp = db.execute("SELECT MAX(timestamp) FROM messages").fetchone()[0]

    # Emits the message
    data_to_send = {
        "username": usern,
        "user_pic": pic_path("users_pics", session["uid"]),
        "message": msg,
        "timestamp": str(timestamp)
    }

    room_path = server_name + "/" + room_name
    
    emit("announce text", data_to_send, broadcast=True, room=room_path)
