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
      accommodations
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
  accommodations
  // cruises // Removed
) {
  const dailyInfoByDate = {};
  let currentAccommodation = null;
  // let currentCruise = null; // Already removed

  for (let d = new Date(startDate); d <= endDate; d = addDays(d, 1)) {
    const dateStr = formatDate(d);
    const dayItems = itineraryByDate[dateStr] || [];

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
      title: dayTitle,
      stayingAt: stayingAt, // Where you are *staying* this night (determined by end of day state)
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
    const items = itineraryByDate[dateStr] || [];
    const info = dailyInfoByDate[dateStr] || {
      title: "Error",
      stayingAt: null,
      // onCruise: null, // Removed
    };

    // Find week for this day
    const weekData = weeks.find((w) => {
      const weekStart = parseDate(w.startDate);
      const weekEnd = parseDate(w.endDate);
      return weekStart && weekEnd && d >= weekStart && d <= weekEnd;
    });

    if (weekData && (!currentWeek || currentWeek.id !== weekData.id)) {
      // Start a new week
      currentWeek = {
        id: weekData.id,
        header: weekData.weekHeader,
        days: [],
      };
      processedWeeks.push(currentWeek);
    }

    if (currentWeek) {
      // Add day to the current week
      currentWeek.days.push({
        dateStr: dateStr,
        dayNumber: dayCounter,
        dayName: dayName,
        title: info.title,
        stayingAt: info.stayingAt, // Pass stayingAt info
        // onCruise: info.onCruise, // Removed
        items: items.map((item) => {
          const location = locations[item.locationRef];
          // Use pre-fetched address from groupItineraryByDate if available, otherwise lookup
          const address = item.locationAddress || location?.address;
          const mapUrl = address
            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                address
              )}`
            : null;

          return {
            // Map raw item data to what the template needs
            id: item.id,
            eventType: item.eventType || item.type || "other", // Ensure eventType exists
            time: item.time || item.startTime || null, // Handle different time properties
            displayDescription: item.description || item.name || "", // Use description or name
            // Use pre-fetched name from groupItineraryByDate if available, otherwise lookup
            locationName: item.locationName || location?.name || null,
            formattedLocation: formatLocation(location), // Pre-format location details for display
            confirmation: item.confirmation || null,
            notes: item.notes || null,
            // Determine if it's a generic "Explore <Location>" activity
            isGenericExplore: isGenericExploreActivity(
              item.description,
              info.title // Pass the calculated day title for comparison
            ),
            // Add tentative flag
            tentative:
              item.tentative || item.certainty === "tentative" || false,
            // Add original type for potential styling/logic
            originalType: item.type || null,
            // Add URL if present
            url: item.url || null,
            // Add Google Maps link if address exists
            mapUrl: mapUrl,
            // Add icon name
            icon: getIconForType(
              item.eventType || item.type || "other",
              item.description
            ), // Pass description for context
            // Flag check-in/out/embark/disembark for potential styling
            isCheckInOut: item.isCheckInOut || false,
          };
        }),
      });
    }
  }
  return processedWeeks;
}

// --- Icon Mapping ---
function getIconForType(type, description = "") {
  const typeLower = type?.toLowerCase() || "other";
  const descLower = description?.toLowerCase() || "";

  // Basic mapping - assumes Font Awesome classes (e.g., fas fa-...)
  // Replace with actual icon classes/names as needed
  const iconMap = {
    flight: "fas fa-plane-departure", // More specific
    "accommodation-check-in": "fas fa-sign-in-alt",
    "accommodation-check-out": "fas fa-sign-out-alt",
    "accommodation-stay": "fas fa-bed",
    hotel: "fas fa-hotel", // If type is directly 'hotel'
    airbnb: "fas fa-home", // If type is directly 'airbnb'
    "cruise-embark": "fas fa-ship",
    "cruise-disembark": "fas fa-anchor",
    "cruise-stay": "fas fa-ship", // Use ship icon for stay days
    "port-call": "fas fa-map-marked-alt", // More specific
    "sea-day": "fas fa-water",
    "car-rental": "fas fa-car",
    activity: "fas fa-calendar-check", // Generic activity
    shopping: "fas fa-shopping-bag",
    meal: "fas fa-utensils", // Example for potential future type
    park: "fas fa-tree",
    gardens: "fas fa-leaf",
    race: "fas fa-flag-checkered",
    visit: "fas fa-landmark",
    explore: "fas fa-binoculars", // For generic explore
    travel: "fas fa-suitcase-rolling", // Generic travel
    other: "fas fa-info-circle",
  };

  // Contextual overrides based on description
  if (descLower.includes("disney") || descLower.includes("theme park"))
    return "fas fa-magic";
  if (
    descLower.includes("stadium") ||
    descLower.includes("match") ||
    descLower.includes("game")
  )
    return "fas fa-futbol"; // Soccer ball
  if (descLower.includes("capitol")) return "fas fa-landmark";
  if (descLower.includes("garden")) return iconMap["gardens"];
  if (descLower.includes("park") && !descLower.includes("shopping"))
    return iconMap["park"];
  if (descLower.includes("shopping")) return iconMap["shopping"];
  if (descLower.includes("race")) return iconMap["race"];

  // Handle variations like 'car-rental-pickup', 'car-rental-drop-off'
  if (typeLower.startsWith("car-rental")) return iconMap["car-rental"];
  // Handle accommodation types passed directly
  if (typeLower === "hotel") return iconMap["hotel"];
  if (typeLower === "airbnb") return iconMap["airbnb"];
  // Default accommodation/cruise icons if specific event types aren't matched
  if (typeLower.startsWith("accommodation"))
    return iconMap["accommodation-stay"];
  if (typeLower.startsWith("cruise")) return iconMap["cruise-stay"];
  if (typeLower.includes("explore")) return iconMap["explore"];
  if (typeLower.includes("visit")) return iconMap["visit"];

  return iconMap[typeLower] || iconMap["other"]; // Fallback to 'other'
}

// --- Progress Calculation ---
function calculateProgress(startDateUTC, endDateUTC, nowUTC) {
  if (!startDateUTC || !endDateUTC || !nowUTC) return 0;
  const totalDuration = endDateUTC - startDateUTC;
  const elapsedDuration = nowUTC - startDateUTC;
  if (totalDuration <= 0) return 100; // Avoid division by zero or negative duration
  const progress = Math.max(
    0,
    Math.min(100, (elapsedDuration / totalDuration) * 100)
  );
  return progress;
}

function getProgressText(progress) {
  if (progress <= 0) return "Trip hasn't started yet!";
  if (progress >= 100) return "Trip completed!";
  return `Trip is ${progress.toFixed(1)}% complete.`;
}

// --- Alpine.js Component ---
// (This part remains in index.html within the <script> tag)
