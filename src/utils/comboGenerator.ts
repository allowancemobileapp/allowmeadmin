export class MenuItem {
  name: string;
  category: string;
  portion: string;
  quantity: number;
  calories: number;
  fullPrice: number;
  meal_id: number;

  constructor(name: string, price: number, category: string, portion = "Full", quantity = 1, calories = 0, meal_id: number) {
    this.name = name;
    this.category = category.toLowerCase();
    this.portion = portion;
    this.quantity = quantity;
    this.calories = calories;
    this.meal_id = meal_id;
    const portionMultipliers: Record<string, number> = { "Half": 0.5, "Three-Quarter": 0.75, "Full": 1.0 };
    if (this.category.includes("main")) {
      const enteredMultiplier = portionMultipliers[portion] || 1.0;
      this.fullPrice = price / enteredMultiplier;
    } else {
      this.fullPrice = price;
    }
  }
}

export class Combo {
  items: [MenuItem, string | number][];
  totalPrice: number;
  totalCalories: number;
  hasPack: boolean;

  constructor() {
    this.items = [];
    this.totalPrice = 0;
    this.totalCalories = 0;
    this.hasPack = false;
  }

  addItem(item: MenuItem, portionOrQuantity: string | number) {
    const portionMultipliers: Record<string, number> = { "Half": 0.5, "Three-Quarter": 0.75, "Full": 1.0 };
    if (item.category.includes("main")) {
      const portion = portionOrQuantity as string;
      const multiplier = portionMultipliers[portion] || 1.0;
      this.totalPrice += item.fullPrice * multiplier;
      this.totalCalories += (item.calories || 0) * multiplier;
      this.items.push([item, portion]);
    } else {
      const quantity = portionOrQuantity as number;
      this.totalPrice += item.fullPrice * quantity;
      this.totalCalories += (item.calories || 0) * quantity;
      this.items.push([item, quantity]);
    }
  }

  addPack() {
    if (!this.hasPack) {
      this.totalPrice += 200;
      this.hasPack = true;
    }
  }

  hasCategory(category: string) {
    return this.items.some(([item]) => item.category === category.toLowerCase());
  }

  countCategoryItems(category: string) {
    return this.items.filter(([item]) => item.category === category.toLowerCase()).length;
  }

  getSignature() {
    return this.items
      .map(([item, portionOrQuantity]) => `${item.category}:${item.name},${portionOrQuantity}`)
      .sort()
      .join('|') + (this.hasPack ? '|Pack' : '');
  }

  toString() {
    const itemStrs = this.items.map(([item, portionOrQuantity]) => {
      if (item.category.includes("main")) {
        return `${item.name} (${portionOrQuantity})`;
      }
      return `${item.name} x${portionOrQuantity}`;
    });
    return itemStrs.join(" + ") + (this.hasPack ? " + Pack" : "");
  }
}

export class FoodComboGenerator {
  menu: Record<string, MenuItem[]>;
  sections: string[];
  PACK_PRICE = 200;
  mainPortions = ["Half", "Three-Quarter", "Full"];

  constructor(menuData: Record<string, MenuItem[]>, sections: string[]) {
    this.menu = menuData;
    this.sections = sections;
  }

  isValidCombo(combo: Combo) {
    if (!combo.items.length) return false;
    const hasMain = combo.hasCategory("main");
    const hasTop = combo.hasCategory("top");
    const hasSide = combo.hasCategory("side");
    const hasSnacks = combo.hasCategory("snacks");
    const hasFruits = combo.hasCategory("fruits");
    const hasDrinks = combo.hasCategory("drinks");
    const mainCount = combo.countCategoryItems("main");
    const topCount = combo.countCategoryItems("top");
    const sideCount = combo.countCategoryItems("side");
    const snackCount = combo.countCategoryItems("snacks");
    const fruitCount = combo.countCategoryItems("fruits");
    const drinkCount = combo.countCategoryItems("drinks");

    if (mainCount > 2) return false;
    if (topCount > 5) return false;
    if (sideCount > 3) return false;
    if (drinkCount > 1) return false;

    const uniqueSections = new Set(combo.items.map(([item]) => item.category));
    if (uniqueSections.size === 1 && !uniqueSections.has("fruits")) return false;
    if (hasFruits && combo.items.some(([item]) => item.category !== "fruits" && item.category !== "drinks")) return false;
    
    if (hasSnacks) {
      if (combo.items.some(([item]) => item.category !== "snacks" && item.category !== "drinks")) return false;
      if (combo.totalPrice > 3000) return false;
      if (combo.hasPack) return false;
    }
    
    if (!hasSnacks && !combo.hasPack) return false;
    return true;
  }

  sample(array: any[], count: number) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  generateFruitCombo() {
    const combo = new Combo();
    if (!this.menu["fruits"] || !this.menu["fruits"].length) return combo;
    const fruitCount = Math.min(3, this.menu["fruits"].length);
    const numFruits = Math.floor(Math.random() * fruitCount) + 1;
    const selectedFruits = this.sample(this.menu["fruits"], numFruits);
    selectedFruits.forEach(fruit => {
      const quantity = Math.floor(Math.random() * 3) + 1;
      combo.addItem(fruit, quantity);
    });
    if (Math.random() < 0.5 && this.menu["drinks"] && this.menu["drinks"].length) {
      const drink = this.menu["drinks"][Math.floor(Math.random() * this.menu["drinks"].length)];
      combo.addItem(drink, 1);
    }
    combo.addPack();
    return combo;
  }

  generateSnackCombo() {
    const combo = new Combo();
    if (!this.menu["snacks"] || !this.menu["snacks"].length) return combo;
    const snackCount = Math.min(3, this.menu["snacks"].length);
    const numSnacks = Math.floor(Math.random() * snackCount) + 1;
    const selectedSnacks = this.sample(this.menu["snacks"], numSnacks);
    selectedSnacks.forEach(snack => {
      const quantity = Math.floor(Math.random() * 3) + 1;
      combo.addItem(snack, quantity);
    });
    if (Math.random() < 0.7 && this.menu["drinks"] && this.menu["drinks"].length) {
      const drink = this.menu["drinks"][Math.floor(Math.random() * this.menu["drinks"].length)];
      combo.addItem(drink, 1);
    }
    return combo;
  }

  generateGeneralCombo() {
    const combo = new Combo();
    const sections = ["main", "top", "side"];
    const availableSections = sections.filter(s => this.menu[s] && this.menu[s].length > 0);
    if (availableSections.length === 0) return combo;
    
    if (this.menu["main"] && this.menu["main"].length > 0) {
      const mainItems = this.sample(this.menu["main"], Math.min(2, Math.floor(Math.random() * 2) + 1));
      mainItems.forEach(item => {
        const portion = this.mainPortions[Math.floor(Math.random() * this.mainPortions.length)];
        combo.addItem(item, portion);
      });
    }
    if (this.menu["top"] && this.menu["top"].length > 0 && Math.random() < 0.8) {
      const topCount = Math.min(5, this.menu["top"].length);
      const numTops = Math.floor(Math.random() * (topCount + 1));
      const selectedTops = this.sample(this.menu["top"], numTops);
      selectedTops.forEach(item => {
        const quantity = Math.floor(Math.random() * 2) + 1;
        combo.addItem(item, quantity);
      });
    }
    if (this.menu["side"] && this.menu["side"].length > 0 && Math.random() < 0.7) {
      const sideCount = Math.min(3, this.menu["side"].length);
      const numSides = Math.floor(Math.random() * (sideCount + 1));
      const selectedSides = this.sample(this.menu["side"], numSides);
      selectedSides.forEach(item => {
        const quantity = Math.floor(Math.random() * 2) + 1;
        combo.addItem(item, quantity);
      });
    }
    if (Math.random() < 0.6 && this.menu["drinks"] && this.menu["drinks"].length > 0) {
      const drink = this.menu["drinks"][Math.floor(Math.random() * this.menu["drinks"].length)];
      combo.addItem(drink, 1);
    }
    combo.addPack();
    return combo;
  }

  generateCombos(numCombos = 50, minPrice = 500, maxPrice = 5000): Combo[] {
    const validCombos = [];
    const comboSignatures = new Set();
    const generalTarget = Math.floor(numCombos * 0.75);
    const snackTarget = Math.floor(numCombos * 0.15);
    const fruitTarget = numCombos - generalTarget - snackTarget;
    let generalCount = 0, snackCount = 0, fruitCount = 0;
    const maxAttempts = numCombos * 10;
    let attempts = 0;
    while (
      (generalCount < generalTarget || snackCount < snackTarget || fruitCount < fruitTarget) &&
      validCombos.length < numCombos &&
      attempts < maxAttempts
    ) {
      attempts++;
      let combo;
      if (generalCount < generalTarget && Math.random() < 0.8) {
        combo = this.generateGeneralCombo();
      } else if (snackCount < snackTarget && this.menu["snacks"] && this.menu["snacks"].length > 0 && Math.random() < 0.6) {
        combo = this.generateSnackCombo();
      } else if (fruitCount < fruitTarget && this.menu["fruits"] && this.menu["fruits"].length > 0) {
        combo = this.generateFruitCombo();
      } else {
        combo = this.generateGeneralCombo();
      }
      if (this.isValidCombo(combo) && minPrice <= combo.totalPrice && combo.totalPrice <= maxPrice) {
        const signature = combo.getSignature();
        if (!comboSignatures.has(signature)) {
          comboSignatures.add(signature);
          validCombos.push(combo);
          if (combo.hasCategory("fruits") && combo.items.every(([item]) => item.category === "fruits" || item.category === "drinks")) {
            fruitCount++;
          } else if (combo.hasCategory("snacks")) {
            snackCount++;
          } else {
            generalCount++;
          }
        }
      }
    }
    validCombos.sort((a, b) => a.totalPrice - b.totalPrice);
    return validCombos.slice(0, numCombos);
  }
}
