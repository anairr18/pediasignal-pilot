import { Router } from "express";
import passport from "passport";
import { hashPassword } from "../auth";
import { storage } from "../storage";

const router = Router();

router.post("/register", async (req, res, next) => {
    try {
        const existingUser = await storage.getUserByUsername(req.body.username);
        if (existingUser) {
            return res.status(400).send("Username already exists");
        }

        const hashedPassword = await hashPassword(req.body.password);
        const user = await storage.createUser({
            ...req.body,
            password: hashedPassword,
            role: req.body.role || 'medical_student'
        });

        req.login(user, (err) => {
            if (err) return next(err);
            res.status(201).json(user);
        });
    } catch (err) {
        next(err);
    }
});

router.post("/login", passport.authenticate("local"), (req, res) => {
    res.json(req.user);
});

router.post("/logout", (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        res.sendStatus(200);
    });
});

router.get("/user", (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    res.json(req.user);
});

export default router;
