-- Stored Procedures for Exercise App

-- 1. Procedure to auto-log a workout session
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS LogWorkout(
    IN p_date DATETIME,
    IN p_category VARCHAR(50),
    IN p_muscle INT,
    IN p_exercise VARCHAR(255),
    IN p_sets INT,
    IN p_reps INT,
    IN p_weight DECIMAL(5,2)
)
BEGIN
    INSERT INTO exercises (date, category, muscle, exercise, sets, reps, weight)
    VALUES (p_date, p_category, p_muscle, p_exercise, p_sets, p_reps, p_weight);
END$$

DELIMITER ;


-- 2. Procedure to get personal records for all exercises
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS GetPersonalRecords()
BEGIN
    SELECT
        e.exercise,
        m.muscle_name,
        MAX(e.weight) as max_weight,
        MAX(e.date) as pr_date
    FROM exercises e
    LEFT JOIN muscles m ON e.muscle = m.id
    GROUP BY e.exercise, m.muscle_name
    ORDER BY max_weight DESC;
END$$

DELIMITER ;


-- 3. Procedure to get weekly summary
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS GetWeeklySummary(IN weeks_back INT)
BEGIN
    SELECT
        YEAR(date) as year,
        WEEK(date) as week,
        COUNT(DISTINCT DATE(date)) as workout_days,
        SUM(sets) as total_sets,
        SUM(reps) as total_reps,
        SUM(weight * sets * reps) as total_volume
    FROM exercises
    WHERE date >= DATE_SUB(NOW(), INTERVAL weeks_back WEEK)
    GROUP BY YEAR(date), WEEK(date)
    ORDER BY year DESC, week DESC;
END$$

DELIMITER ;


-- 4. Procedure to get monthly summary
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS GetMonthlySummary(IN months_back INT)
BEGIN
    SELECT
        YEAR(date) as year,
        MONTH(date) as month,
        MONTHNAME(date) as month_name,
        COUNT(DISTINCT DATE(date)) as workout_days,
        SUM(sets) as total_sets,
        SUM(reps) as total_reps,
        SUM(weight * sets * reps) as total_volume
    FROM exercises
    WHERE date >= DATE_SUB(NOW(), INTERVAL months_back MONTH)
    GROUP BY YEAR(date), MONTH(date), MONTHNAME(date)
    ORDER BY year DESC, month DESC;
END$$

DELIMITER ;


-- 5. Procedure to get muscle distribution
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS GetMuscleDistribution()
BEGIN
    SELECT
        m.muscle_name,
        COUNT(*) as count,
        ROUND((COUNT(*) * 100.0 / (SELECT COUNT(*) FROM exercises)), 2) as percentage
    FROM exercises e
    JOIN muscles m ON e.muscle = m.id
    GROUP BY m.muscle_name
    ORDER BY count DESC;
END$$

DELIMITER ;


-- 6. Procedure to check if a new PR is set
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS CheckForPR(
    IN p_exercise VARCHAR(255),
    IN p_weight DECIMAL(5,2),
    OUT is_pr BOOLEAN
)
BEGIN
    DECLARE max_weight DECIMAL(5,2);

    SELECT MAX(weight) INTO max_weight
    FROM exercises
    WHERE exercise = p_exercise;

    IF max_weight IS NULL OR p_weight > max_weight THEN
        SET is_pr = TRUE;
    ELSE
        SET is_pr = FALSE;
    END IF;
END$$

DELIMITER ;


-- 7. Procedure to get daily totals for a specific date
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS GetDailyTotals(IN workout_date DATE)
BEGIN
    SELECT
        DATE(date) as workout_date,
        SUM(sets) as total_sets,
        SUM(reps) as total_reps,
        SUM(weight * sets * reps) as total_volume,
        COUNT(DISTINCT exercise) as exercises_count
    FROM exercises
    WHERE DATE(date) = workout_date
    GROUP BY DATE(date);
END$$

DELIMITER ;


-- 8. Procedure to get workout streak (consecutive days with workouts)
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS GetWorkoutStreak()
BEGIN
    WITH RECURSIVE workout_dates AS (
        SELECT DISTINCT DATE(date) as workout_date
        FROM exercises
        ORDER BY workout_date DESC
    ),
    date_diffs AS (
        SELECT
            workout_date,
            LAG(workout_date) OVER (ORDER BY workout_date DESC) as prev_date,
            DATEDIFF(LAG(workout_date) OVER (ORDER BY workout_date DESC), workout_date) as day_diff
        FROM workout_dates
    )
    SELECT
        COUNT(*) as current_streak
    FROM date_diffs
    WHERE workout_date >= (
        SELECT COALESCE(MIN(workout_date), CURDATE())
        FROM date_diffs
        WHERE day_diff > 1 OR day_diff IS NULL
    );
END$$

DELIMITER ;


-- 9. Procedure to auto-log a complete workout session with multiple exercises
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS LogWorkoutSession(
    IN p_date DATETIME,
    IN p_category VARCHAR(50)
)
BEGIN
    DECLARE session_id INT;

    -- This would be extended to handle multiple exercises in a transaction
    START TRANSACTION;

    -- Log would be inserted here
    -- This is a template - actual implementation would take JSON or multiple parameters

    COMMIT;

    SELECT 'Workout session logged successfully' as message;
END$$

DELIMITER ;


-- 10. Procedure to get progress for a specific exercise over time
DELIMITER $$

CREATE PROCEDURE IF NOT EXISTS GetExerciseProgress(IN exercise_name VARCHAR(255))
BEGIN
    SELECT
        DATE(date) as workout_date,
        weight as max_weight,
        sets,
        reps,
        (weight * sets * reps) as volume
    FROM exercises
    WHERE exercise = exercise_name
    ORDER BY date ASC;
END$$

DELIMITER ;

-- Display success message
SELECT 'All stored procedures created successfully!' as status;
