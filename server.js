import express from "express";
import bodyParser from "body-parser";
import {db} from "./db.js"; // FIXED
import { USER_PROFILE } from "./config.js";

const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));


// HOME PAGE
app.get("/", async (req, res) => {
    try {
        const [weightRows] = await db.query(
            "SELECT * FROM daily_weight ORDER BY date DESC LIMIT 1"
        );

        const [logs] = await db.query(
            "SELECT * FROM exercises ORDER BY date DESC, id DESC"
        );

        let weight = weightRows.length ? weightRows[0].weight : null;
        let weightDate = weightRows.length ? weightRows[0].date : null;
        let bmi = null;

        if (weight) {
            let m = USER_PROFILE.height / 100;
            bmi = (weight / (m * m)).toFixed(1);
        }

        res.render("index", {
            profile: USER_PROFILE,
            currentWeight: weight,
            weightDate,
            bmi,
            logs
        });

    } catch (err) {
        console.error("Home Error:", err);
        res.send("Error loading Homepage");
    }
});


// PROFILE PAGE
app.get("/profile", async (req, res) => {
    try {
        const [weightRows] = await db.query(
            "SELECT * FROM daily_weight ORDER BY date DESC LIMIT 1"
        );

        let weight = weightRows.length ? weightRows[0].weight : null;
        let bmi = null;

        if (weight) {
            let m = USER_PROFILE.height / 100;
            bmi = (weight / (m * m)).toFixed(1);
        }

        res.render("profile", {
            profile: USER_PROFILE,
            currentWeight: weight,
            bmi
        });
    } catch (err) {
        console.error("Profile Error:", err);
        res.render("profile", {
            profile: USER_PROFILE,
            currentWeight: null,
            bmi: null
        });
    }
});


// UPDATE PROFILE (HEIGHT & WEIGHT)
app.post("/update-profile", async (req, res) => {
    const { height, weight, date } = req.body;

    try {
        // Update height in USER_PROFILE (in-memory for now)
        if (height) {
            USER_PROFILE.height = parseInt(height);
        }

        // Update weight in database if provided
        if (weight && date) {
            await db.query(
                "INSERT INTO daily_weight (date, weight) VALUES (?, ?) ON DUPLICATE KEY UPDATE weight = ?",
                [date, weight, weight]
            );
        }

        res.redirect("/profile");
    } catch (err) {
        console.error("Update Profile Error:", err);
        res.redirect("/profile");
    }
});


// DAILY WEIGHT PAGE
app.get("/weight", (req, res) => {
    res.render("weight");
});

app.post("/weight", async (req, res) => {
    const { date, weight } = req.body;

    await db.query(
        "INSERT INTO daily_weight (date, weight) VALUES (?, ?)",
        [date, weight]
    );

    res.redirect("/");
});


// CHOOSE MUSCLE PAGE
app.get("/workout/:category", async (req, res) => {
    const category = req.params.category;

    const [muscles] = await db.query(
        "SELECT * FROM muscles WHERE category = ?",
        [category]
    );

    res.render("choose-muscle", { category, muscles });
});


// CHOOSE EXERCISE PAGE
app.get("/workout/:category/:muscleId", async (req, res) => {
    const { category, muscleId } = req.params;

    const [exercises] = await db.query(
        "SELECT * FROM exercise_library WHERE muscle_id = ?",
        [muscleId]
    );

    res.render("choose-exercise", {
        category,
        muscleId,
        exercises
    });
});


// LOG EXERCISE (with individual sets)
app.post("/log-exercise", async (req, res) => {
    const { date, category, muscle, exercise, reps, weight } = req.body;

    // Handle multiple sets - reps and weight are arrays
    const repsArray = Array.isArray(reps) ? reps : [reps];
    const weightArray = Array.isArray(weight) ? weight : [weight];

    // Insert each set as a separate record
    for (let i = 0; i < repsArray.length; i++) {
        await db.query(
            "INSERT INTO exercises (date, category, muscle, exercise, sets, reps, weight) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [date, category, muscle, exercise, i + 1, repsArray[i], weightArray[i]]
        );
    }

    res.redirect("/");
});


// ADD CUSTOM EXERCISE
app.post("/add-custom-exercise", async (req, res) => {
    const { muscleId, exerciseName } = req.body;

    await db.query(
        "INSERT INTO exercise_library (muscle_id, exercise_name) VALUES (?, ?)",
        [muscleId, exerciseName]
    );

    res.redirect("back");
});


// ADD MUSCLE PAGE
app.get("/add-muscle", (req, res) => {
    const category = req.query.category || "";
    res.render("add-muscle", { category });
});

app.post("/add-muscle", async (req, res) => {
    try {
        const { category, muscle } = req.body;

        await db.query(
            "INSERT INTO muscles (category, muscle_name) VALUES (?, ?)",
            [category, muscle]
        );

        res.redirect(`/workout/${category}`);
    } catch (err) {
        console.error("Add Muscle Error:", err);
        res.redirect("back");
    }
});


// ANALYTICS PAGE
app.get("/analytics", async (req, res) => {
    try {
        // Get weight history
        const [weightHistory] = await db.query(
            "SELECT date, weight FROM daily_weight ORDER BY date ASC"
        );

        // Calculate BMI for each weight entry
        const weightData = weightHistory.map(row => ({
            date: row.date.toISOString().split('T')[0],
            weight: row.weight,
            bmi: (row.weight / Math.pow(USER_PROFILE.height / 100, 2)).toFixed(1)
        }));

        // Get muscle group workout distribution
        const [muscleDistribution] = await db.query(
            "SELECT muscle, COUNT(*) as count FROM exercises GROUP BY muscle ORDER BY count DESC"
        );

        // Get recent workout logs with progression
        const [workoutLogs] = await db.query(
            "SELECT date, category, muscle, exercise, sets, reps, weight FROM exercises ORDER BY date DESC LIMIT 50"
        );

        // Get exercise progression (track max weight for each exercise over time)
        const [exerciseProgression] = await db.query(
            "SELECT exercise, date, MAX(weight) as max_weight FROM exercises GROUP BY exercise, date ORDER BY date ASC"
        );

        res.render("analytics", {
            profile: USER_PROFILE,
            weightData,
            muscleDistribution,
            workoutLogs,
            exerciseProgression
        });
    } catch (err) {
        console.error("Analytics Error:", err);
        res.send("Error loading analytics page");
    }
});


// ADMIN DATABASE MANAGEMENT PAGE
app.get("/admin/database", async (req, res) => {
    try {
        const [muscles] = await db.query("SELECT * FROM muscles ORDER BY category, muscle_name");
        const [exercises] = await db.query(
            "SELECT el.*, m.muscle_name, m.category FROM exercise_library el LEFT JOIN muscles m ON el.muscle_id = m.id ORDER BY m.category, m.muscle_name, el.exercise_name"
        );

        res.render("admin-database", {
            muscles,
            exercises,
            muscleSuccess: false,
            exerciseSuccess: false
        });
    } catch (err) {
        console.error("Admin Database Error:", err);
        res.send("Error loading admin page");
    }
});


// ADD MUSCLE GROUP (ADMIN)
app.post("/admin/add-muscle", async (req, res) => {
    try {
        const { category, muscle_name } = req.body;

        await db.query(
            "INSERT INTO muscles (category, muscle_name) VALUES (?, ?)",
            [category, muscle_name]
        );

        const [muscles] = await db.query("SELECT * FROM muscles ORDER BY category, muscle_name");

        res.render("admin-database", {
            muscles,
            muscleSuccess: true,
            exerciseSuccess: false
        });
    } catch (err) {
        console.error("Add Muscle Error:", err);
        res.redirect("/admin/database");
    }
});


// ADD EXERCISE (ADMIN)
app.post("/admin/add-exercise", async (req, res) => {
    try {
        const { muscle_id, exercise_name } = req.body;

        await db.query(
            "INSERT INTO exercise_library (muscle_id, exercise_name) VALUES (?, ?)",
            [muscle_id, exercise_name]
        );

        const [muscles] = await db.query("SELECT * FROM muscles ORDER BY category, muscle_name");

        res.render("admin-database", {
            muscles,
            muscleSuccess: false,
            exerciseSuccess: true
        });
    } catch (err) {
        console.error("Add Exercise Error:", err);
        res.redirect("/admin/database");
    }
});


// DELETE MUSCLE (ADMIN)
app.post("/admin/delete-muscle/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM muscles WHERE id = ?", [id]);
        res.redirect("/admin/database");
    } catch (err) {
        console.error("Delete Muscle Error:", err);
        res.redirect("/admin/database");
    }
});


// DELETE EXERCISE (ADMIN)
app.post("/admin/delete-exercise/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await db.query("DELETE FROM exercise_library WHERE id = ?", [id]);
        res.redirect("/admin/database");
    } catch (err) {
        console.error("Delete Exercise Error:", err);
        res.redirect("/admin/database");
    }
});


// UPDATE MUSCLE (ADMIN)
app.post("/admin/update-muscle/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { category, muscle_name } = req.body;
        await db.query(
            "UPDATE muscles SET category = ?, muscle_name = ? WHERE id = ?",
            [category, muscle_name, id]
        );
        res.redirect("/admin/database");
    } catch (err) {
        console.error("Update Muscle Error:", err);
        res.redirect("/admin/database");
    }
});


// UPDATE EXERCISE (ADMIN)
app.post("/admin/update-exercise/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { muscle_id, exercise_name } = req.body;
        await db.query(
            "UPDATE exercise_library SET muscle_id = ?, exercise_name = ? WHERE id = ?",
            [muscle_id, exercise_name, id]
        );
        res.redirect("/admin/database");
    } catch (err) {
        console.error("Update Exercise Error:", err);
        res.redirect("/admin/database");
    }
});


app.listen(3000, () =>
    console.log("Server running at http://localhost:3000")
);
