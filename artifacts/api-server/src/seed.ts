/**
 * Seed script: populates TIP101 course data.
 * Run with: npx tsx artifacts/api-server/src/seed.ts
 * (or via pnpm --filter @workspace/api-server run seed)
 *
 * Engineering decision: seed is idempotent — it checks for existing data
 * before inserting so it's safe to re-run.
 */
import "@workspace/db/load-env";
import { db } from "@workspace/db";
import {
  coursesTable,
  unitsTable,
  problemsTable,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const COURSE_SLUG = "tip101";

const UNITS = [
  { order: 1, title: "Arrays & Hashing", description: "Master hash maps, sets, and array manipulation techniques." },
  { order: 2, title: "Two Pointers", description: "Solve problems by moving two pointers through an array." },
  { order: 3, title: "Sliding Window", description: "Optimize subarray problems with a moving window." },
  { order: 4, title: "Stack", description: "Use stacks for bracket matching, monotonic problems, and more." },
  { order: 5, title: "Binary Search", description: "Divide and conquer sorted arrays and search spaces." },
  { order: 6, title: "Linked Lists", description: "Traverse, reverse, and manipulate linked list structures." },
  { order: 7, title: "Trees", description: "Recursively traverse binary trees and BSTs." },
  { order: 8, title: "Graphs", description: "BFS, DFS, and connected components on graphs." },
  { order: 9, title: "Dynamic Programming", description: "Build up solutions from overlapping subproblems." },
  { order: 10, title: "Greedy", description: "Make locally optimal choices for globally optimal solutions." },
];

// Problems for Unit 1: Arrays & Hashing
const UNIT1_PROBLEMS = [
  {
    order: 1,
    title: "Two Sum",
    slug: "two-sum",
    difficulty: "easy",
    description: `Given an array of integers \`nums\` and an integer \`target\`, return the **indices** of the two numbers that add up to \`target\`.

You may assume that each input would have **exactly one solution**, and you may not use the same element twice.

You can return the answer in any order.`,
    examples: [
      { input: "nums = [2,7,11,15], target = 9", output: "[0,1]", explanation: "nums[0] + nums[1] == 9, so we return [0, 1]." },
      { input: "nums = [3,2,4], target = 6", output: "[1,2]" },
      { input: "nums = [3,3], target = 6", output: "[0,1]" },
    ],
    constraints: ["2 ≤ nums.length ≤ 10⁴", "-10⁹ ≤ nums[i] ≤ 10⁹", "-10⁹ ≤ target ≤ 10⁹", "Exactly one valid answer exists."],
    starterCode: `def two_sum(nums: list[int], target: int) -> list[int]:
    """
    Find two numbers that add up to target.
    Return their indices.
    """
    # Write your solution here
    pass


# Test your solution
print(two_sum([2, 7, 11, 15], 9))   # Expected: [0, 1]
print(two_sum([3, 2, 4], 6))         # Expected: [1, 2]`,
    tags: ["array", "hash-map"],
  },
  {
    order: 2,
    title: "Contains Duplicate",
    slug: "contains-duplicate",
    difficulty: "easy",
    description: `Given an integer array \`nums\`, return \`true\` if any value appears **at least twice** in the array, and return \`false\` if every element is distinct.`,
    examples: [
      { input: "nums = [1,2,3,1]", output: "true" },
      { input: "nums = [1,2,3,4]", output: "false" },
      { input: "nums = [1,1,1,3,3,4,3,2,4,2]", output: "true" },
    ],
    constraints: ["1 ≤ nums.length ≤ 10⁵", "-10⁹ ≤ nums[i] ≤ 10⁹"],
    starterCode: `def contains_duplicate(nums: list[int]) -> bool:
    # Write your solution here
    pass


print(contains_duplicate([1, 2, 3, 1]))       # Expected: True
print(contains_duplicate([1, 2, 3, 4]))        # Expected: False`,
    tags: ["array", "hash-set"],
  },
  {
    order: 3,
    title: "Valid Anagram",
    slug: "valid-anagram",
    difficulty: "easy",
    description: `Given two strings \`s\` and \`t\`, return \`true\` if \`t\` is an **anagram** of \`s\`, and \`false\` otherwise.

An anagram is a word or phrase formed by rearranging the letters of a different word, using all the original letters exactly once.`,
    examples: [
      { input: 's = "anagram", t = "nagaram"', output: "true" },
      { input: 's = "rat", t = "car"', output: "false" },
    ],
    constraints: ["1 ≤ s.length, t.length ≤ 5 × 10⁴", "s and t consist of lowercase English letters."],
    starterCode: `def is_anagram(s: str, t: str) -> bool:
    # Write your solution here
    pass


print(is_anagram("anagram", "nagaram"))  # Expected: True
print(is_anagram("rat", "car"))          # Expected: False`,
    tags: ["string", "hash-map", "sorting"],
  },
  {
    order: 4,
    title: "Group Anagrams",
    slug: "group-anagrams",
    difficulty: "medium",
    description: `Given an array of strings \`strs\`, group the **anagrams** together. You can return the answer in **any order**.`,
    examples: [
      {
        input: 'strs = ["eat","tea","tan","ate","nat","bat"]',
        output: '[["bat"],["nat","tan"],["ate","eat","tea"]]',
      },
      { input: 'strs = [""]', output: '[[""]]' },
      { input: 'strs = ["a"]', output: '[["a"]]' },
    ],
    constraints: ["1 ≤ strs.length ≤ 10⁴", "0 ≤ strs[i].length ≤ 100", "strs[i] consists of lowercase English letters."],
    starterCode: `def group_anagrams(strs: list[str]) -> list[list[str]]:
    # Write your solution here
    pass


print(group_anagrams(["eat","tea","tan","ate","nat","bat"]))`,
    tags: ["array", "hash-map", "string", "sorting"],
  },
  {
    order: 5,
    title: "Top K Frequent Elements",
    slug: "top-k-frequent-elements",
    difficulty: "medium",
    description: `Given an integer array \`nums\` and an integer \`k\`, return the \`k\` most frequent elements. You may return the answer in **any order**.`,
    examples: [
      { input: "nums = [1,1,1,2,2,3], k = 2", output: "[1,2]" },
      { input: "nums = [1], k = 1", output: "[1]" },
    ],
    constraints: [
      "1 ≤ nums.length ≤ 10⁵",
      "k is in the range [1, the number of unique elements in the array]",
      "It is guaranteed that the answer is unique.",
    ],
    starterCode: `def top_k_frequent(nums: list[int], k: int) -> list[int]:
    # Write your solution here
    pass


print(top_k_frequent([1,1,1,2,2,3], 2))  # Expected: [1, 2]
print(top_k_frequent([1], 1))             # Expected: [1]`,
    tags: ["array", "hash-map", "heap", "bucket-sort"],
  },
];

// Problems for Unit 2: Two Pointers
const UNIT2_PROBLEMS = [
  {
    order: 1,
    title: "Valid Palindrome",
    slug: "valid-palindrome",
    difficulty: "easy",
    description: `A phrase is a **palindrome** if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward.

Given a string \`s\`, return \`true\` if it is a palindrome, or \`false\` otherwise.`,
    examples: [
      { input: 's = "A man, a plan, a canal: Panama"', output: "true", explanation: '"amanaplanacanalpanama" is a palindrome.' },
      { input: 's = "race a car"', output: "false" },
      { input: 's = " "', output: "true", explanation: "s is an empty string after removing non-alphanumeric characters." },
    ],
    constraints: ["1 ≤ s.length ≤ 2 × 10⁵", "s consists only of printable ASCII characters."],
    starterCode: `def is_palindrome(s: str) -> bool:
    # Write your solution here
    pass


print(is_palindrome("A man, a plan, a canal: Panama"))  # True
print(is_palindrome("race a car"))                       # False`,
    tags: ["string", "two-pointers"],
  },
  {
    order: 2,
    title: "Two Sum II - Input Array Is Sorted",
    slug: "two-sum-ii",
    difficulty: "medium",
    description: `Given a **1-indexed** array of integers \`numbers\` that is already **sorted in non-decreasing order**, find two numbers such that they add up to a specific \`target\`.

Return the indices of the two numbers (1-indexed) as an integer array of size 2.`,
    examples: [
      { input: "numbers = [2,7,11,15], target = 9", output: "[1,2]" },
      { input: "numbers = [2,3,4], target = 6", output: "[1,3]" },
    ],
    constraints: ["2 ≤ numbers.length ≤ 3 × 10⁴", "Use O(1) extra space."],
    starterCode: `def two_sum(numbers: list[int], target: int) -> list[int]:
    # Write your solution here
    pass


print(two_sum([2, 7, 11, 15], 9))  # Expected: [1, 2]`,
    tags: ["array", "two-pointers", "binary-search"],
  },
  {
    order: 3,
    title: "3Sum",
    slug: "3sum",
    difficulty: "medium",
    description: `Given an integer array \`nums\`, return all the triplets \`[nums[i], nums[j], nums[k]]\` such that \`i != j\`, \`i != k\`, and \`j != k\`, and \`nums[i] + nums[j] + nums[k] == 0\`.

The solution set must not contain duplicate triplets.`,
    examples: [
      { input: "nums = [-1,0,1,2,-1,-4]", output: "[[-1,-1,2],[-1,0,1]]" },
      { input: "nums = [0,1,1]", output: "[]" },
      { input: "nums = [0,0,0]", output: "[[0,0,0]]" },
    ],
    constraints: ["3 ≤ nums.length ≤ 3000", "-10⁵ ≤ nums[i] ≤ 10⁵"],
    starterCode: `def three_sum(nums: list[int]) -> list[list[int]]:
    # Write your solution here
    pass


print(three_sum([-1, 0, 1, 2, -1, -4]))  # Expected: [[-1,-1,2],[-1,0,1]]`,
    tags: ["array", "two-pointers", "sorting"],
  },
];

async function seed() {
  console.log("🌱 Seeding TIP101 course...");

  // Check if course already exists
  const existing = await db.query.coursesTable.findFirst({
    where: eq(coursesTable.slug, COURSE_SLUG),
  });

  if (existing) {
    console.log("✅ Course already seeded — skipping.");
    process.exit(0);
  }

  // Insert course
  const [course] = await db
    .insert(coursesTable)
    .values({
      slug: COURSE_SLUG,
      name: "TIP101 — Technical Interview Prep",
      description:
        "A structured course covering data structures and algorithms for technical interviews, from arrays to dynamic programming.",
    })
    .returning();

  console.log(`✅ Created course: ${course.name} (id=${course.id})`);

  // Insert units
  const insertedUnits = await db
    .insert(unitsTable)
    .values(UNITS.map((u) => ({ ...u, courseId: course.id })))
    .returning();

  console.log(`✅ Created ${insertedUnits.length} units`);

  // Insert problems for Unit 1
  const unit1 = insertedUnits.find((u) => u.order === 1)!;
  // Pass arrays/objects directly — Drizzle handles JSONB serialization.
  // Manually JSON.stringify-ing here would store a string in the JSONB column,
  // causing downstream code (API routes, UI, AI prompt builder) to receive
  // a string instead of an array when reading the field back.
  await db.insert(problemsTable).values(
    UNIT1_PROBLEMS.map((p) => ({
      ...p,
      unitId: unit1.id,
      solutionCode: "",
    })),
  );
  console.log(`✅ Created ${UNIT1_PROBLEMS.length} problems for Unit 1`);

  // Insert problems for Unit 2
  const unit2 = insertedUnits.find((u) => u.order === 2)!;
  await db.insert(problemsTable).values(
    UNIT2_PROBLEMS.map((p) => ({
      ...p,
      unitId: unit2.id,
      solutionCode: "",
    })),
  );
  console.log(`✅ Created ${UNIT2_PROBLEMS.length} problems for Unit 2`);

  console.log("🎉 Seed complete!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
