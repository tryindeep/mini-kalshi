import {test , expect } from "bun:test";
import axios from "axios";

const BACKEND_URL="http://locahost:3001";

const USERNAME = `tridp-${Math.random()}`;


test("If username is small, the signup endpoint should return a 411 status code" , async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/auth/signup`, {
            username : "a",
            password : "flashjjjdfkjhjs",
            role: "user"
        });

        expect.fail();

    } catch (error) {
        console.log(error.status)
        expect(error.status).toBe(411);
    }
});

test("If username, password or role are not present should return a 411 status code" , async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/auth/signup`, {
       
        });

        expect.fail();

    } catch (error) {
        console.log(error.status)
        expect(error.status).toBe(411);
    }
});

test("If username, password or role are not present should return a 411 status code" , async () => {
    try {
        const response = await axios.post(`${BACKEND_URL}/auth/signup`, {
            username : USERNAME,
            password : "123123"
        });

        expect(res.status).toBe(200);


        
        expect.fail();

    } catch (error) {
        console.log(error.status)
        expect(error.status).toBe(411);
    }
});


