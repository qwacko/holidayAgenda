// js/script.js - Refactored for Alpine.js

// --- Date Utilities ---
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date) {
  // YYYY-MM-DD
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(dateString) {
  // YYYY-MM-DD
  if (!dateString) return null;
  const parts = dateString.split("-");
  // Note: Month is 0-indexed in JS Date constructor
  try {
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    if (isNaN(date.getTime())) {
      console.warn("Invalid date string parsed:", dateString);
      return null;
    }
    return date;
  } catch (e) {
    console.error("Error parsing date:", dateString, e);
    return null;
  }
}

function getDayName(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    console.warn("Invalid date passed to getDayName:", date);
    return "Invalid Date";
  }
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// --- Helper function to format location details ---
function formatLocation(location) {
  if (!location) return "";
  let locationText = location.name || "";
  // Don't add address here, it's handled separately with map link
  // if (location.address) locationText += `, ${location.address}`;
  if (location.country) locationText += `, ${location.country}`;
  if (location.details) locationText += ` (${location.details})`;
  // Keep newlines for potential pre-wrap styling, but remove leading space after newline
  return locationText.replace(/\n\s*/g, "\n");
}

// --- Helper to determine if an activity is generic exploration ---
function isGenericExploreActivity(description, dayLocationTitle) {
  if (!description || !dayLocationTitle) return false;
  const cleanedDesc = description
    .replace(/^Explore\s+/i, "")
    .replace(/\s+Area$/i, "")
    .trim();
  const cleanedTitle = dayLocationTitle.replace(/\s+Area$/i, "").trim();
  return cleanedDesc.toLowerCase() === cleanedTitle.toLowerCase();
}

// --- Main function to load and process data for Alpine ---
async function loadTripData() {
  try {
    const response = await fetch("data/travel.json");
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // --- Data Lookups ---
    const locations = data.locations || {};
    const accommodations = data.accommodations || [];
    const days = data.days || [];
    // Cruises are now handled within accommodations/events
    const events = data.events || [];
    const weeks = data.weeks || [];

    // --- Parse overall trip dates ---
    const { tripStartDate, tripEndDate, tripStartDateUTC, tripEndDateUTC } =
      parseTripDates(data.tripDates);
    if (!tripStartDate || !tripEndDate) {
      throw new Error("Could not parse trip start/end dates.");
    }

    // --- Group data by date ---
    const itineraryByDate = groupItineraryByDate(
      tripStartDate,
      tripEndDate,
      accommodations,
      // cruises, // Removed: Handled via accommodation type and events
      events,
      locations // Pass locations for address lookup
    );

    // --- Calculate daily status ---
    const dailyInfoByDate = calculateDailyInfo(
      tripStartDate,
      tripEndDate,
      itineraryByDate,
      locations,
      accommodations,
      days
      // cruises // Removed: Handled via accommodation type
    );

    // --- Structure data for Alpine ---
    const processedWeeks = structureDataForAlpine(
      tripStartDate,
      tripEndDate,
      weeks,
      itineraryByDate,
      dailyInfoByDate,
      locations
    );

    return {
      tripTitle: data.tripTitle || "Trip Agenda",
      tripDates: data.tripDates || "Unknown Dates",
      tripStartDateUTC: tripStartDateUTC,
      tripEndDateUTC: tripEndDateUTC,
      weeks: processedWeeks,
      locations: locations, // Pass locations for potential lookups in Alpine if needed
      loading: false,
      error: null,
      todayDateString: formatDate(new Date()), // For highlighting today
      // Add UI state properties
      openWeekIds: processedWeeks.map((w) => w.id), // Start with all weeks open
      openDayIds: processedWeeks.flatMap((w) => w.days.map((d) => d.dateStr)), // Start with all days open
      nowUTC: Date.now(), // For progress calculation
    };
  } catch (error) {
    console.error("Error loading or processing trip data:", error);
    return {
      tripTitle: "Error Loading Trip",
      tripDates: "",
      weeks: [],
      locations: {},
      loading: false,
      error: `Failed to load itinerary: ${error.message}`,
      tripStartDateUTC: null,
      tripEndDateUTC: null,
      todayDateString: formatDate(new Date()),
      openWeekIds: [],
      openDayIds: [],
      nowUTC: Date.now(),
    };
  }
}

// --- Data Processing Functions ---

function parseTripDates(tripDatesString) {
  // Parses "Month Day - Month Day, Year" format
  try {
    const dateParts = tripDatesString.split(" - ");
    const startDateStr = dateParts[0];
    const endDateStr = dateParts[1];
    const year = parseInt(endDateStr.split(", ")[1], 10);

    const months = {
      January: 0,
      February: 1,
      March: 2,
      April: 3,
      May: 4,
      June: 5,
      July: 6,
      August: 7,
      September: 8,
      October: 9,
      November: 10,
      December: 11,
    };

    const startMonthName = startDateStr.split(" ")[0];
    const startDay = parseInt(startDateStr.split(" ")[1], 10);
    const startMonth = months[startMonthName];

    const endMonthName = endDateStr.split(" ")[0];
    const endDay = parseInt(endDateStr.split(",")[0].split(" ")[1], 10);
    const endMonth = months[endMonthName];

    if (
      isNaN(year) ||
      startMonth === undefined ||
      isNaN(startDay) ||
      endMonth === undefined ||
      isNaN(endDay)
    ) {
      throw new Error("Could not parse date components.");
    }

    const tripStartDate = new Date(year, startMonth, startDay);
    const tripEndDate = new Date(year, endMonth, endDay);

    if (isNaN(tripStartDate.getTime()) || isNaN(tripEndDate.getTime())) {
      throw new Error("Parsed dates resulted in Invalid Date.");
    }

    // Store UTC versions for progress calculation (use noon to avoid timezone issues at midnight)
    const tripStartDateUTC = Date.UTC(year, startMonth, startDay, 12, 0, 0);
    const tripEndDateUTC = Date.UTC(year, endMonth, endDay, 12, 0, 0);

    return { tripStartDate, tripEndDate, tripStartDateUTC, tripEndDateUTC };
  } catch (e) {
    console.error("Error parsing trip dates string:", tripDatesString, e);
    return {
      tripStartDate: null,
      tripEndDate: null,
      tripStartDateUTC: null,
      tripEndDateUTC: null,
    };
  }
}

function groupItineraryByDate(
  startDate,
  endDate,
  accommodations,
  // cruises, // Removed
  events,
  locations // Added for address lookup
) {
  const itineraryByDate = {};
  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const dateStr = formatDate(d);
    itineraryByDate[dateStr] = [];
  }

  // Process Accommodations (including cruises treated as accommodation)
  accommodations.forEach((acc) => {
    const start = parseDate(acc.startDate);
    const end = parseDate(acc.endDate); // Check-out/Disembark is *after* the last night
    if (!start || !end) return;

    let current = new Date(start);
    const endDateAcc = new Date(end); // Use different variable name

    while (current < endDateAcc) {
      // Loop until the day *before* check-out/disembark
      const dateStr = formatDate(current);
      if (itineraryByDate[dateStr]) {
        let eventType;
        let isCheckInOut = false;
        if (formatDate(current) === acc.startDate) {
          eventType =
            acc.type === "cruise" ? "cruise-embark" : "accommodation-check-in";
          isCheckInOut = true;
        } else {
          eventType =
            acc.type === "cruise" ? "cruise-stay" : "accommodation-stay"; // Intermediate days
        }
        itineraryByDate[dateStr].push({
          ...acc,
          eventType: eventType,
          isCheckInOut: isCheckInOut, // Flag for potential different display
          // Add location details directly for easier access later
          locationName: locations[acc.locationRef]?.name,
          locationAddress: locations[acc.locationRef]?.address,
        });
      }
      current = addDays(current, 1);
    }

    // Add check-out/disembark event on the end date
    const checkOutDateStr = formatDate(endDateAcc);
    if (itineraryByDate[checkOutDateStr]) {
      itineraryByDate[checkOutDateStr].push({
        ...acc,
        eventType:
          acc.type === "cruise"
            ? "cruise-disembark"
            : "accommodation-check-out",
        isCheckInOut: true, // Flag for potential different display
        locationName: locations[acc.locationRef]?.name, // May differ from departure/arrival port for cruise
        locationAddress: locations[acc.locationRef]?.address,
      });
    }
  });

  // Removed cruise processing block - handled by accommodation logic now

  // Process Events
  events.forEach((event) => {
    const eventLocation = locations[event.locationRef];
    if (event.date) {
      // Single day event
      const dateStr = event.date;
      if (itineraryByDate[dateStr]) {
        itineraryByDate[dateStr].push({
          ...event,
          eventType: event.type,
          locationName: eventLocation?.name,
          locationAddress: eventLocation?.address,
        });
      }
    } else if (event.startDate && event.endDate) {
      // Multi-day event
      let current = parseDate(event.startDate);
      const end = parseDate(event.endDate);
      if (!current || !end) return;
      while (current <= end) {
        const dateStr = formatDate(current);
        if (itineraryByDate[dateStr]) {
          // Removed multiDayStatus - no longer adding (Start)/(End)
          itineraryByDate[dateStr].push({
            ...event,
            eventType: event.type,
            // Add location details if available
            locationName: eventLocation?.name,
            locationAddress: eventLocation?.address,
          });
        }
        current = addDays(current, 1);
      }
    }
  });

  return itineraryByDate;
}

function calculateDailyInfo(
  startDate,
  endDate,
  itineraryByDate,
  locations,
  accommodations,
  days
  // cruises // Removed
) {
  const dailyInfoByDate = {};
  let currentAccommodation = null;
  // let currentCruise = null; // Already removed

  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const dateStr = formatDate(d);
    const dayItems = itineraryByDate[dateStr] || [];

    const day = days.find((d) => d.date === dateStr);

    let dayTitle = "Location Unknown";
    let stayingAt = null; // Where you are staying *this night*
    // let onCruise = null; // Already removed
    let isTravelDay = false;
    // let isCruiseDay = false; // Already removed

    // --- Determine Status Logic ---

    // 1. Check for Check-out (Affects *previous* day's state, but flags today)
    // Note: Cruise disembark is handled like accommodation check-out now
    const checkOut = dayItems.find(
      (item) =>
        item.eventType === "accommodation-check-out" ||
        item.eventType === "cruise-disembark"
    );
    // const cruiseDisembark = dayItems.find( // Already removed
    //   (item) => item.eventType === "cruise-disembark"
    // );
    if (checkOut) {
      const loc = locations[checkOut.locationRef];
      // Use a generic departure title unless it's a flight day (handled later)
      dayTitle = `Departure from ${loc?.name || checkOut.name}`;
      isTravelDay = true;
      // Clear state *after* processing this day (handled at the end of the loop)
    }
    // Already removed cruiseDisembark block

    // 2. Determine *current* state based on *previous* day's end state
    // Already removed cruise state check block
    if (currentAccommodation) {
      // If we ended yesterday in accommodation...
      const loc = locations[currentAccommodation.locationRef];
      dayTitle = loc?.name || currentAccommodation.name; // Default title if not overridden
      stayingAt = currentAccommodation.name; // You are staying here tonight
      // onCruise = null; // Already removed
    } else {
      // If not in accommodation from yesterday, assume travel/transition
      stayingAt = null;
      // onCruise = null; // Already removed
      // Title might be set by check-in/flight later
    }

    // 3. Check for Check-in (Overrides title, sets state for *next* day)
    // Note: Cruise embark is handled like accommodation check-in now
    const checkIn = dayItems.find(
      (item) =>
        item.eventType === "accommodation-check-in" ||
        item.eventType === "cruise-embark"
    );
    // const cruiseEmbark = dayItems.find( // Already removed
    //   (item) => item.eventType === "cruise-embark"
    // );

    if (checkIn) {
      const loc = locations[checkIn.locationRef];
      dayTitle = `Arrival in ${loc?.name || checkIn.name}`;
      isTravelDay = true;
      // Find the actual accommodation object to set for the *next* day's check
      // This state update happens at the end of the loop
      stayingAt = null; // Don't show "staying at" on check-in day itself
      // currentCruise = null; // Already removed
      // onCruise = null; // Already removed
    }
    // Already removed cruiseEmbark block

    // 4. Check for Flights (Marks as travel day, potentially overrides title)
    const flight = dayItems.find((item) => item.eventType === "flight");
    if (flight) {
      isTravelDay = true;
      if (flight.details) {
        const parts = flight.details.split(" to ");
        dayTitle =
          parts.length === 2
            ? `Travel: ${parts[0]} → ${parts[1]}`
            : "Travel Day (Flight)";
      } else {
        dayTitle = "Travel Day (Flight)";
      }
      // If flying, clear accommodation status unless checking in same day
      if (!checkIn) {
        // Clear state *after* processing this day (handled at the end of the loop)
        stayingAt = null; // Not staying anywhere tonight if flying out without checking in
      }
      // if (!cruiseEmbark) currentCruise = null; // Already removed
      // onCruise = null; // Already removed
    }

    // 5. Final title check if still default and not explicitly travel
    if (dayTitle === "Location Unknown" && !isTravelDay) {
      if (currentAccommodation) {
        // Should have been set earlier if staying
        const loc = locations[currentAccommodation.locationRef];
        dayTitle = loc?.name || currentAccommodation.name;
        // } else if (currentCruise) { // Already removed cruise check
      } else {
        // Look for *any* activity location?
        const firstActivity = dayItems.find(
          (item) => item.locationRef && item.eventType === "activity"
        );
        if (firstActivity) {
          const loc = locations[firstActivity.locationRef];
          dayTitle = loc?.name || "Activity Location";
        } else {
          dayTitle = "Transition / Free Day"; // Better default
        }
      }
    } else if (dayTitle === "Location Unknown" && isTravelDay) {
      // If travel day and still unknown, likely just transit
      dayTitle = "Travel Day";
    }

    dailyInfoByDate[dateStr] = {
      title: (day && day.title) || dayTitle,
      stayingAt: stayingAt, // Where you are *staying* this night (determined by end of day state)
      timezone: day?.timezone || null,
      // onCruise: onCruise, // Already removed
    };

    // IMPORTANT: Update state *after* processing the day for the *next* iteration
    // If checking out today, clear accommodation for tomorrow's check
    if (checkOut) currentAccommodation = null;
    // If disembarking today, clear cruise for tomorrow's check (handled by checkOut)
    // Removed cruise state updates
    // if (cruiseDisembark) currentCruise = null; // Already removed

    // If checking in today, set accommodation for tomorrow's check
    if (checkIn) {
      currentAccommodation =
        accommodations.find((a) => a.id === checkIn.id) || null;
    }
    // If embarking today, set cruise for tomorrow's check (Handled by checkIn logic now)
  }

  return dailyInfoByDate;
}

function structureDataForAlpine(
  startDate,
  endDate,
  weeks,
  itineraryByDate,
  dailyInfoByDate,
  locations
) {
  const processedWeeks = [];
  let currentWeek = null;
  let dayCounter = 0;

  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    dayCounter++;
    const dateStr = formatDate(d);
    const dayName = getDayName(d);
    const allDayItems = itineraryByDate[dateStr] || []; // Renamed from items
    const info = dailyInfoByDate[dateStr] || {
      title: "Error",
      stayingAt: null,
      timezone: null,
      // onCruise: null, // Removed
    };

    // Find the corresponding week definition or create a default one
    const weekInfo = weeks.find((w) => {
      const weekStart = parseDate(w.startDate);
      const weekEnd = parseDate(w.endDate);
      return weekStart && weekEnd && d >= weekStart && d <= weekEnd;
    }) || {
      id: `week-${processedWeeks.length + 1}`,
      title: `Week ${processedWeeks.length + 1}`,
    }; // Default week

    // Start a new week if necessary
    if (!currentWeek || currentWeek.id !== weekInfo.id) {
      currentWeek = {
        id: weekInfo.id,
        title: weekInfo.weekHeader,
        days: [],
      };
      processedWeeks.push(currentWeek);
    }

    // --- NEW: Separate confirmed and tentative items ---
    const confirmedItemsRaw = allDayItems.filter((item) => !item.tentative);
    const tentativeItemsRaw = allDayItems.filter((item) => item.tentative);

    // --- Process items (both confirmed and tentative) ---
    const processItems = (itemsToProcess) => {
      return itemsToProcess
        .filter((item) => {
          // Filter out generic "Explore <Location>" if it matches the day's title
          // and filter out accommodation/cruise stay events (handled by dailyInfo)
          const isGenericExplore = isGenericExploreActivity(
            item.description,
            info.title
          );
          const isStayEvent =
            item.eventType === "accommodation-stay" ||
            item.eventType === "cruise-stay";
          return !isGenericExplore && !isStayEvent;
        })
        .map((item) => {
          const location = locations[item.locationRef];
          const locationName = item.locationName || location?.name; // Use pre-calculated name first
          const locationAddress = item.locationAddress || location?.address; // Use pre-calculated address first
          const mapLink = locationAddress
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                locationAddress
              )}`
            : locationName
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                locationName
              )}`
            : null;

          return {
            ...item, // Spread original item properties
            icon: getIconForType(item.eventType || item.type, item.description),
            formattedLocation: formatLocation(location), // Format location name/details
            mapLink: mapLink,
            // Keep original description, details, time etc. from item
          };
        });
    };

    const confirmedItems = processItems(confirmedItemsRaw);
    const tentativeItems = processItems(tentativeItemsRaw);
    // --- End NEW ---

    // Add the day to the current week\
    currentWeek.days.push({
      dateStr: dateStr,
      dayName: dayName,
      dayNumber: dayCounter,
      title: info.title,
      stayingAt: info.stayingAt,
      timezone: info.timezone,
      // onCruise: info.onCruise, // Removed
      // items: processedItems, // OLD: Replaced
      confirmedItems: confirmedItems, // NEW
      tentativeItems: tentativeItems, // NEW
      hasTentativeItems: tentativeItems.length > 0, // NEW: Flag for easier template logic
      tentativeItemCount: tentativeItems.length, // NEW: Count for summary
    });
  }

  return processedWeeks;
}

// --- Helper function to get icon based on type ---
function getIconForType(type, description = "") {
  // Normalize description for keyword checking
  const lowerDesc = description.toLowerCase();

  // Specific keyword checks first
  if (lowerDesc.includes("vs")) return "⚽"; // Soccer match
  if (lowerDesc.includes("race")) return "🏁"; // Race event

  const iconMap = {
    flight: "✈️",
    "car-rental": "🚗",
    "car-rental-pickup": "🚗", // Specific pickup
    "car-rental-drop-off": "🚗", // Specific dropoff
    accommodation: "🏨",
    "accommodation-check-in": "🏨", // Check-in
    "accommodation-check-out": "🏨", // Check-out
    airbnb: "🏠", // Could use a house icon for Airbnb
    hotel: "🏨",
    cruise: "🚢",
    "cruise-embark": "🚢", // Embark
    "cruise-disembark": "🚢", // Disembark
    "port-call": "⚓", // Port call
    "sea-day": "🌊", // Day at sea
    activity: "🚶‍♀️", // Default activity
    shopping: "🛍️", // Shopping specific
    gardens: "🌳", // Garden specific
    park: "🌳", // Park specific
    visit: "🏛️", // Visiting a landmark/building
    explore: "🗺️", // General exploration
    food: "🍔", // Food related
    travel: "➡️", // Generic travel/transition if not flight/car
    arrival: "🛬", // Generic arrival
    departure: "🛫", // Generic departure
    default: "📌", // Default pin
  };

  // More specific activity checks based on type AND description
  if (type === "activity") {
    if (lowerDesc.includes("shopping")) return iconMap.shopping;
    if (lowerDesc.includes("garden")) return iconMap.gardens;
    if (lowerDesc.includes("park")) return iconMap.park;
    if (lowerDesc.includes("visit")) return iconMap.visit;
    if (lowerDesc.includes("explore")) return iconMap.explore;
    if (lowerDesc.includes("food") || lowerDesc.includes("walmart"))
      return iconMap.food;
  }

  // Handle specific event types like check-in/out, embark/disembark
  if (type === "accommodation-check-in")
    return iconMap["accommodation-check-in"];
  if (type === "accommodation-check-out")
    return iconMap["accommodation-check-out"];
  if (type === "cruise-embark") return iconMap["cruise-embark"];
  if (type === "cruise-disembark") return iconMap["cruise-disembark"];
  if (type === "car-rental-pickup") return iconMap["car-rental-pickup"];
  if (type === "car-rental-drop-off") return iconMap["car-rental-drop-off"];

  return iconMap[type] || iconMap.default;
}

// --- Helper function to calculate trip progress ---
function calculateProgress(startDateUTC, endDateUTC, nowUTC) {
  if (!startDateUTC || !endDateUTC || !nowUTC) return 0;
  const totalDuration = endDateUTC - startDateUTC;
  const elapsedDuration = nowUTC - startDateUTC;
  if (totalDuration <= 0) return nowUTC >= endDateUTC ? 100 : 0; // Handle same day or past trips
  const progress = Math.max(
    0,
    Math.min(100, (elapsedDuration / totalDuration) * 100)
  );
  return Math.round(progress);
}

// --- Helper function to get progress text ---
function getProgressText(progress) {
  if (progress <= 0) return "Not Started";
  if (progress >= 100) return "Completed";
  return `${progress}% Complete`;
}

// --- Initialize Alpine.js ---
document.addEventListener("alpine:init", () => {
  Alpine.data("tripAgenda", () => ({
    tripTitle: "Loading...",
    tripDates: "",
    weeks: [],
    locations: {},
    loading: true,
    error: null,
    tripStartDateUTC: null,
    tripEndDateUTC: null,
    todayDateString: formatDate(new Date()),
    openWeekIds: [], // IDs of open weeks
    openDayIds: [], // dateStr of open days
    nowUTC: Date.now(), // For progress calculation
    progressPercent: 0,
    progressText: "Calculating...",

    // Method to initialize data
    async init() {
      const data = await loadTripData();
      this.tripTitle = data.tripTitle;
      this.tripDates = data.tripDates;
      this.weeks = data.weeks;
      this.locations = data.locations;
      this.loading = data.loading;
      this.error = data.error;
      this.tripStartDateUTC = data.tripStartDateUTC;
      this.tripEndDateUTC = data.tripEndDateUTC;
      this.openWeekIds = data.openWeekIds;
      this.openDayIds = data.openDayIds;
      this.nowUTC = data.nowUTC; // Use consistent 'now' from load time

      // Calculate progress after data is loaded
      this.progressPercent = calculateProgress(
        this.tripStartDateUTC,
        this.tripEndDateUTC,
        this.nowUTC
      );
      this.progressText = getProgressText(this.progressPercent);

      // Update 'now' and progress periodically (e.g., every minute)
      setInterval(() => {
        this.nowUTC = Date.now();
        this.progressPercent = calculateProgress(
          this.tripStartDateUTC,
          this.tripEndDateUTC,
          this.nowUTC
        );
        this.progressText = getProgressText(this.progressPercent);
      }, 60000); // Update every 60 seconds
    },

    // Methods to toggle sections
    toggleWeek(weekId) {
      if (this.openWeekIds.includes(weekId)) {
        this.openWeekIds = this.openWeekIds.filter((id) => id !== weekId);
      } else {
        this.openWeekIds.push(weekId);
      }
    },
    toggleDay(dayId) {
      if (this.openDayIds.includes(dayId)) {
        this.openDayIds = this.openDayIds.filter((id) => id !== dayId);
      } else {
        this.openDayIds.push(dayId);
      }
    },
    isWeekOpen(weekId) {
      return this.openWeekIds.includes(weekId);
    },
    isDayOpen(dayId) {
      return this.openDayIds.includes(dayId);
    },
  }));
});
