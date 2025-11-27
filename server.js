import express from "express";
import bodyParser from "body-parser";
import {db} from "./db.js"; // FIXED
import { USER_PROFILE } from "./config.js";

const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

// Helper function to calculate age from DOB
function calculateAge(dob) {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}

// Helper function to format datetime to 12-hour format
function formatDateTime(datetime) {
    const date = new Date(datetime);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const formattedHours = hours % 12 || 12;
    const formattedMinutes = minutes.toString().padStart(2, '0');
    const formattedDate = date.toISOString().split('T')[0];
    const formattedTime = `${formattedHours}:${formattedMinutes} ${ampm}`;
    return { date: formattedDate, time: formattedTime, full: `${formattedDate} ${formattedTime}` };
}


// HOME PAGE
app.get("/", async (req, res) => {
    try {
        const [weightRows] = await db.query(
            "SELECT * FROM daily_weight ORDER BY date DESC LIMIT 1"
        );

        const [logs] = await db.query(
            "SELECT e.*, m.muscle_name FROM exercises e LEFT JOIN muscles m ON e.muscle = m.id ORDER BY e.date DESC"
        );

        let weight = weightRows.length ? weightRows[0].weight : null;
        let bmi = null;

        if (weight) {
            let m = USER_PROFILE.height / 100;
            bmi = (weight / (m * m)).toFixed(1);
        }

        // Calculate age
        const age = calculateAge(USER_PROFILE.dob);

        // Format logs with proper time
        const formattedLogs = logs.map(log => ({
            ...log,
            formattedDateTime: formatDateTime(log.date)
        }));

        res.render("index", {
            profile: { ...USER_PROFILE, age },
            currentWeight: weight,
            bmi,
            logs: formattedLogs,
            formatDateTime
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

        // Calculate age
        const age = calculateAge(USER_PROFILE.dob);

        res.render("profile", {
            profile: { ...USER_PROFILE, age },
            currentWeight: weight,
            bmi
        });
    } catch (err) {
        console.error("Profile Error:", err);
        const age = calculateAge(USER_PROFILE.dob);
        res.render("profile", {
            profile: { ...USER_PROFILE, age },
            currentWeight: null,
            bmi: null
        });
    }
});


// DAILY WEIGHT PAGE
app.get("/weight", (req, res) => {
    res.render("weight");
});

app.post("/weight", async (req, res) => {
    const { date, weight } = req.body;

    // Use INSERT ... ON DUPLICATE KEY UPDATE to handle both insert and update
    await db.query(
        "INSERT INTO daily_weight (date, weight) VALUES (?, ?) ON DUPLICATE KEY UPDATE weight = ?",
        [date, weight, weight]
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


// LOG EXERCISE
app.post("/log-exercise", async (req, res) => {
    const { date, category, muscle, exercise, sets, reps, weight } = req.body;

    await db.query(
        "INSERT INTO exercises (date, category, muscle, exercise, sets, reps, weight) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [date, category, muscle, exercise, sets, reps, weight]
    );

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


// ADMIN DATABASE MANAGEMENT PAGE
app.get("/admin/database", async (req, res) => {
    try {
        const [muscles] = await db.query("SELECT * FROM muscles ORDER BY category, muscle_name");

        res.render("admin-database", {
            muscles,
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


// STATS PAGE - Daily totals, PRs, Weekly/Monthly summaries
app.get("/stats", async (req, res) => {
    try {
        // Daily totals
        const [dailyTotals] = await db.query(
            `SELECT
                DATE(date) as workout_date,
                SUM(sets) as total_sets,
                SUM(reps) as total_reps,
                SUM(weight * sets * reps) as total_volume
            FROM exercises
            GROUP BY DATE(date)
            ORDER BY workout_date DESC
            LIMIT 30`
        );

        // Personal Records (PRs) - Max weight for each exercise
        const [personalRecords] = await db.query(
            `SELECT
                e.exercise,
                m.muscle_name,
                MAX(e.weight) as max_weight,
                e.date as pr_date
            FROM exercises e
            LEFT JOIN muscles m ON e.muscle = m.id
            WHERE (e.exercise, e.weight) IN (
                SELECT exercise, MAX(weight)
                FROM exercises
                GROUP BY exercise
            )
            GROUP BY e.exercise, m.muscle_name, e.date
            ORDER BY max_weight DESC`
        );

        // Weekly summary (last 4 weeks)
        const [weeklySummary] = await db.query(
            `SELECT
                YEAR(date) as year,
                WEEK(date) as week,
                COUNT(DISTINCT DATE(date)) as workout_days,
                SUM(sets) as total_sets,
                SUM(reps) as total_reps,
                SUM(weight * sets * reps) as total_volume
            FROM exercises
            WHERE date >= DATE_SUB(NOW(), INTERVAL 4 WEEK)
            GROUP BY YEAR(date), WEEK(date)
            ORDER BY year DESC, week DESC`
        );

        // Monthly summary (last 6 months)
        const [monthlySummary] = await db.query(
            `SELECT
                YEAR(date) as year,
                MONTH(date) as month,
                MONTHNAME(date) as month_name,
                COUNT(DISTINCT DATE(date)) as workout_days,
                SUM(sets) as total_sets,
                SUM(reps) as total_reps,
                SUM(weight * sets * reps) as total_volume
            FROM exercises
            WHERE date >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
            GROUP BY YEAR(date), MONTH(date), MONTHNAME(date)
            ORDER BY year DESC, month DESC`
        );

        // Muscle distribution
        const [muscleDistribution] = await db.query(
            `SELECT m.muscle_name, COUNT(*) AS count
             FROM exercises e
             JOIN muscles m ON e.muscle = m.id
             GROUP BY m.muscle_name
             ORDER BY count DESC`
        );

        // Format dates for daily totals
        const formattedDailyTotals = dailyTotals.map(dt => ({
            ...dt,
            formattedDate: formatDateTime(dt.workout_date).date
        }));

        // Format dates for PRs
        const formattedPRs = personalRecords.map(pr => ({
            ...pr,
            formattedDate: formatDateTime(pr.pr_date).full
        }));

        res.render("stats", {
            dailyTotals: formattedDailyTotals,
            personalRecords: formattedPRs,
            weeklySummary,
            monthlySummary,
            muscleDistribution
        });

    } catch (err) {
        console.error("Stats Error:", err);
        res.send("Error loading stats page");
    }
});


app.listen(3000, () =>
    console.log("Server running at http://localhost:3000")
);
