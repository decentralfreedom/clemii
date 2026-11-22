// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 Clemens Kressmann
import { blogPath, type BlogLanguage } from "@hush/article/taxonomy";

/** A post's address on the website. */
export const blogPathOf = (lang: string, slug: string) => blogPath(lang as BlogLanguage, slug);
