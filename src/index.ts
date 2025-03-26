import express from 'express';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import format from 'pg-format';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT || '5432'),
});

format.config({
    pattern: {
        ident: 'V',
        literal: 'C',
        string: 't'
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

app.get('/', async (req, res) => {
    res.send('Hello World!');
});

app.get('/teams', async (req, res) => {
    try {
        const client = await pool.connect();
        const result = await client.query('SELECT * FROM teams ORDER BY team');
        client.release();
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/teams/records', async (req, res) => {
    const client = await pool.connect();

    const { team } = req.query;
    const table = 'teamrecords';
    let query;
    let result;
    
    try {
        if (team) {
            query = format('SELECT * FROM %V WHERE team = $1 ORDER BY team', table, team);
            result = await client.query(query, [team]);
        } else {
            query = format('SELECT * FROM %V ORDER BY team', table);
            result = await client.query(query);
        }

        res.json(result.rows);
    } catch(error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    } finally {
        client.release();
    }
});

app.get('/teams/stats', async (req, res) => {
    const client = await pool.connect();
    const { team, stat} = req.query;
    const table = 'team_stats';

    let whereConditions: string[] = [];
    let values: any[] = [];
    let index = 1;

    try {
        // Stats are in columns, always include team
        let columns = ['team'];

        if (stat) {
            const stats = Array.isArray(stat) ? stat : [stat]; // Check for multiple stats
            columns.push(...(stats as string[])); // Convert to array to make TypeScript happy
        } else {
            columns = ['*']; // Select all columns if stat is not specified
        }

        if (team) {
            const teams = Array.isArray(team) ? team : [team]; 
            const placeholders = teams.map(() => `$${index++}`).join(', '); // Join teams together if there are multiple
            whereConditions.push(`team IN (${placeholders})`); // Use IN instead of WHERE
            values.push(...teams);
        }

        /*
        / Join columns for %s parameter
        / Use table for %I parameter
        */
        let query = format(`SELECT ${columns.join(', ')} from %V `, table); 

        if (whereConditions.length > 0) {
            query += ` WHERE ${whereConditions.join(' AND ')}`; // Add in where conditions if there are any
        }
        query += ` ORDER BY team`;

        console.log('Constructed query: ' + query);
        console.log('Values: ' + values);
        const result = await client.query(query, values);

        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal Server Error');
    } finally {
        client.release();
    }
});