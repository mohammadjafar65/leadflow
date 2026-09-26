/**
 * Curated vertical taxonomy (50+ entries) mapped to Google Places type /
 * keyword combinations. Served via GET /places/categories and cached in
 * Redis for 24h (architecture.md §4).
 */
export interface Category {
  id: string;
  label: string;
  /** Google Places types to OR together in the search query */
  types: string[];
  /** appended free-text keyword, e.g. "plumber" for plumbing services */
  keyword: string;
}

export const CATEGORIES: Category[] = [
  { id: "restaurants", label: "Restaurants", types: ["restaurant"], keyword: "restaurant" },
  { id: "cafes", label: "Cafes & Coffee Shops", types: ["cafe"], keyword: "coffee shop" },
  { id: "bakeries", label: "Bakeries", types: ["bakery"], keyword: "bakery" },
  { id: "bars", label: "Bars & Pubs", types: ["bar"], keyword: "bar" },
  { id: "food_trucks", label: "Food Trucks", types: ["food_truck"], keyword: "food truck" },
  { id: "law_firms", label: "Law Firms", types: ["law_firm", "attorney"], keyword: "law firm" },
  { id: "dental_clinics", label: "Dental Clinics", types: ["dentist", "dental_clinic"], keyword: "dentist" },
  { id: "doctors", label: "Doctors & Medical Clinics", types: ["doctor", "hospital"], keyword: "doctor" },
  { id: "physiotherapy", label: "Physiotherapy", types: ["physiotherapist"], keyword: "physiotherapist" },
  { id: "pharmacies", label: "Pharmacies", types: ["pharmacy"], keyword: "pharmacy" },
  { id: "veterinarians", label: "Veterinarians", types: ["veterinary_care"], keyword: "veterinarian" },
  { id: "plumbers", label: "Plumbers", types: ["plumber"], keyword: "plumber" },
  { id: "electricians", label: "Electricians", types: ["electrician"], keyword: "electrician" },
  { id: "hvac", label: "HVAC Contractors", types: ["hvac_contractor"], keyword: "HVAC" },
  { id: "roofing", label: "Roofing Contractors", types: ["roofing_contractor"], keyword: "roofer" },
  { id: "landscaping", label: "Landscaping & Lawn Care", types: ["landscape", "lawn_care"], keyword: "landscaper" },
  { id: "pest_control", label: "Pest Control", types: ["pest_control_service"], keyword: "pest control" },
  { id: "cleaning_services", label: "Cleaning Services", types: ["cleaning_service"], keyword: "cleaning service" },
  { id: "moving_companies", label: "Moving Companies", types: ["moving_company"], keyword: "movers" },
  { id: "auto_repair", label: "Auto Repair Shops", types: ["car_repair"], keyword: "auto repair" },
  { id: "auto_dealers", label: "Car Dealerships", types: ["car_dealer"], keyword: "car dealer" },
  { id: "tire_shops", label: "Tire Shops", types: ["tire_shop"], keyword: "tires" },
  { id: "body_shops", label: "Auto Body Shops", types: ["auto_body_shop"], keyword: "auto body shop" },
  { id: "real_estate", label: "Real Estate Agencies", types: ["real_estate_agency"], keyword: "real estate" },
  { id: "property_managers", label: "Property Managers", types: ["property_management_company"], keyword: "property management" },
  { id: "home_builders", label: "Home Builders & Contractors", types: ["general_contractor", "home_builder"], keyword: "home builder" },
  { id: "interior_design", label: "Interior Designers", types: ["interior_designer"], keyword: "interior designer" },
  { id: "architects", label: "Architects", types: ["architect"], keyword: "architect" },
  { id: "accountants", label: "Accountants & Bookkeepers", types: ["accounting"], keyword: "accountant" },
  { id: "financial_planners", label: "Financial Advisors", types: ["financial_advisor"], keyword: "financial advisor" },
  { id: "insurance_agents", label: "Insurance Agents", types: ["insurance_agency"], keyword: "insurance agent" },
  { id: "mortgage_brokers", label: "Mortgage Brokers", types: ["mortgage_broker"], keyword: "mortgage broker" },
  { id: "tax_prep", label: "Tax Preparation", types: ["tax_preparation"], keyword: "tax preparation" },
  { id: "hr_consulting", label: "HR & Staffing Agencies", types: ["employment_agency"], keyword: "staffing agency" },
  { id: "marketing_agencies", label: "Marketing Agencies", types: ["advertising_agency"], keyword: "marketing agency" },
  { id: "web_design", label: "Web Design & Dev", types: ["software_company"], keyword: "web design company" },
  { id: "seo_agencies", label: "SEO Agencies", types: ["consultant"], keyword: "SEO agency" },
  { id: "photographers", label: "Photographers", types: ["photographer"], keyword: "photographer" },
  { id: "videographers", label: "Videographers", types: ["video_production"], keyword: "videographer" },
  { id: "print_shops", label: "Print Shops", types: ["printing_service"], keyword: "printing" },
  { id: "event_planners", label: "Event Planners", types: ["event_planner"], keyword: "event planner" },
  { id: "wedding_venues", label: "Wedding Venues", types: ["wedding_venue"], keyword: "wedding venue" },
  { id: "caterers", label: "Caterers", types: ["caterer"], keyword: "catering" },
  { id: "fitness_gyms", label: "Gyms & Fitness Studios", types: ["gym", "fitness_center"], keyword: "gym" },
  { id: "yoga_studios", label: "Yoga Studios", types: ["yoga_studio"], keyword: "yoga" },
  { id: "martial_arts", label: "Martial Arts Schools", types: ["martial_arts_school"], keyword: "martial arts" },
  { id: "pilates", label: "Pilates Studios", types: ["pilates_studio"], keyword: "pilates" },
  { id: "beauty_salons", label: "Beauty Salons", types: ["beauty_salon"], keyword: "hair salon" },
  { id: "barbershops", label: "Barbershops", types: ["barber_shop"], keyword: "barbershop" },
  { id: "nail_salons", label: "Nail Salons", types: ["nail_salon"], keyword: "nail salon" },
  { id: "spas", label: "Spas & Massage", types: ["spa", "massage"], keyword: "spa" },
  { id: "tattoo_shops", label: "Tattoo Shops", types: ["tattoo_shop"], keyword: "tattoo" },
  { id: "daycares", label: "Daycares & Preschools", types: ["day_care"], keyword: "daycare" },
  { id: "tutoring", label: "Tutoring Centers", types: ["tutoring_center"], keyword: "tutoring" },
  { id: "music_schools", label: "Music Schools", types: ["music_school"], keyword: "music lessons" },
  { id: "language_schools", label: "Language Schools", types: ["language_school"], keyword: "language school" },
  { id: "driving_schools", label: "Driving Schools", types: ["driving_school"], keyword: "driving school" },
  { id: "hotels", label: "Hotels & Inns", types: ["hotel", "lodging"], keyword: "hotel" },
  { id: "hostels", label: "Hostels", types: ["hostel"], keyword: "hostel" },
  { id: "travel_agents", label: "Travel Agencies", types: ["travel_agency"], keyword: "travel agency" },
  { id: "auto_detail", label: "Auto Detailing", types: ["car_wash"], keyword: "auto detailing" },
  { id: "pet_groomers", label: "Pet Groomers", types: ["pet_store", "veterinary_care"], keyword: "pet grooming" },
  { id: "pet_sitting", label: "Pet Sitting & Boarding", types: ["pet_sitting"], keyword: "pet sitter" },
  { id: "funeral_homes", label: "Funeral Homes", types: ["funeral_home"], keyword: "funeral home" },
  { id: "locksmiths", label: "Locksmiths", types: ["locksmith"], keyword: "locksmith" },
  { id: "security_services", label: "Security Services", types: ["security_service"], keyword: "security company" },
  { id: "janitorial", label: "Janitorial Services", types: ["janitorial_service"], keyword: "janitorial" },
  { id: "pool_services", label: "Pool Cleaning & Repair", types: ["pool_cleaning"], keyword: "pool service" },
  { id: "window_cleaning", label: "Window Cleaning", types: ["window_cleaning"], keyword: "window cleaner" },
  { id: "appliance_repair", label: "Appliance Repair", types: ["appliance_repair"], keyword: "appliance repair" },
  { id: "carpet_cleaning", label: "Carpet Cleaning", types: ["carpet_cleaning"], keyword: "carpet cleaning" },
  { id: "storage_units", label: "Self-Storage", types: ["storage"], keyword: "self storage" },
  { id: "waste_management", label: "Waste Management", types: ["garbage_dump"], keyword: "dumpster rental" },
  { id: "sign_shops", label: "Sign Shops", types: ["sign_shop"], keyword: "sign company" },
  { id: "tattoo_removal", label: "Medical Spas & Laser", types: ["spa"], keyword: "laser clinic" },
];

export function getCategory(id: string): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}