import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import asyncHandler from "express-async-handler";
import User, { IUser } from "../models/user";
import mongoose from "mongoose";
import crypto from "crypto";
import sgMail from "@sendgrid/mail";

sgMail.setApiKey(`${process.env.SEND_GRID_API_KEY}`);

export const registerUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    res.status(400);
    throw new Error("Please add all fields");
  }

  const userExists = await User.findOne({ email });

  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user: IUser = await User.create({
    email,
    username,
    password: hashedPassword,
    emailToken: crypto.randomBytes(64).toString("hex")
  });

  if (user) {
    const msg = {
      to: user.email,
      from: `${process.env.SEND_GRID_SENDER}`,
      subject: `Thank you for registering ${user.username}`,
      text: `
        Thank you for registering ${user.username}.
        Please copy and paste the address below to verify your account.
        http://${req.headers.host}/api/users/verify-email?emailToken=${user.emailToken}     
      `,
      html: `
        <h1> Thank you for registering ${user.username}.</h1>
        <p>Please click the link below to verify your account.</a>
        <a href="http://${req.headers.host}/api/users/verify-email?emailToken=${user.emailToken}">Verify your account</a>
      `
    };
    sgMail.send(msg);

    res.status(201).json({
      token: generateToken(user._id, user.username, user.email)
    });
  } else {
    res.status(400);
    throw new Error("Invalid user data");
  }
});

export const verifyEmail = asyncHandler(async (req, res) => {
  const { email, emailToken } = req.body;
  const user: IUser | null = await User.findOne({ email });

  if (user) {
    if (user.emailToken === emailToken) {
      const user = await User.findOneAndUpdate(email, { isVerified: true });
      res.json({
        token: generateToken(user._id, user.username, email)
      });
    } else {
      res.status(400);
      throw new Error("The provided token is incorrect");
    }
  } else {
    res.status(400);
    throw new Error("User does not exist");
  }
});

export const loginUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user: IUser | null = await User.findOne({ email });

  if (user && (await bcrypt.compare(password, user.password))) {
    if (user.isVerified) {
      res.json({
        token: generateToken(user._id, user.username, email)
      });
    } else {
      res.status(400);
      throw new Error("Please check your email");
    }
  } else {
    res.status(400);
    throw new Error("Invalid credentials");
  }
});

const generateToken = (
  id: mongoose.Types.ObjectId,
  username: string,
  email: string
) => {
  return jwt.sign({ id, username, email }, `${process.env.JWT_SECRET}`, {
    expiresIn: "30d"
  });
};
