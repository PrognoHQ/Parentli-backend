import { Request, Response, NextFunction } from "express";
import * as authService from "./service";
import { AppError } from "../../types";

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    if (!email || !password || !firstName || !lastName) {
      throw new AppError("email, password, firstName, and lastName are required.", 400);
    }
    if (password.length < 8) {
      throw new AppError("Password must be at least 8 characters.", 400);
    }

    const result = await authService.register({
      email,
      password,
      firstName,
      lastName,
      phone,
    });

    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError("email and password are required.", 400);
    }

    const result = await authService.login({ email, password });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
