CREATE TABLE request_log(
    ID SERIAL PRIMARY KEY,
    Requested_URL TEXT,
    Song_Name TEXT,
    Time_Taken INTERVAL,
    User_IP TEXT
);